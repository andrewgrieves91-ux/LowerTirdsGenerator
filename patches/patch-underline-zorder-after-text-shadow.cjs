/*
 * patch-underline-zorder-after-text-shadow.cjs
 *
 * Refines the underline z-order: previous patches moved the underline
 * block to BEFORE the text shadow loop. That fixed underline-shadow
 * bleeding onto already-drawn text, but exposed the inverse problem
 * — the text shadow loop's drop-shadow output extends downward into
 * the underline area and paints OVER the underline.
 *
 * User wants: underline ABOVE the text shadow halo, but BELOW the
 * visible text fills (so any underline-shadow that bleeds upward
 * into the text bounding box is still covered).
 *
 * Final order per renderer:
 *
 *   1. Text shadow loop (drop-shadow filter, multi-iteration build-up)
 *   2. Underline + its own shadow         <-- HOISTED HERE
 *   3. Visible text passes (drawImage colorCanvas without filter)
 *
 * Three renderers updated:
 *   - Live `Kt` (`if(_e.config.underline){...}` block)
 *   - Edit `Ye` Meta branch (`if(D){var _euLT=...}`)
 *   - Tc Meta path (`if(p.underline){var _oUlT=...}`)
 *
 * For each, we EXTRACT the existing block (currently positioned BEFORE
 * the shadow loop) and SPLICE it in BETWEEN an `insertPrefix` and an
 * `insertSuffix` that bracket the desired insertion point. This lets
 * us land the block AFTER `n.filter="none"` resets and outside any
 * `if(p.shadowEnabled){...}` wrapper, so it always runs and starts
 * with a clean filter/shadow state.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

function findMatchingBrace(src, startIdx) {
  let i = startIdx;
  while (src[i] !== "{") i++;
  let depth = 1;
  i++;
  let inStr = null;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === "\\" && i + 1 < src.length) { i += 2; continue; }
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

const RENDERERS = [
  {
    label: "Live Kt",
    blockPrefix: "me.restore();",
    blockStartPattern: "if(_e.config.underline){var _lUlT=",
    // Insert AFTER the shadow for-loop body close `}` and BEFORE the
    // visible eyebrow pass. Each shadow-loop iteration uses
    // W.save()/W.restore(), so filter resets implicitly between
    // iterations and at loop end. The for-loop's last statement is the
    // title pass ending in `W.restore()`, then `}` closes the loop.
    insertPrefix: "W.restore()}",
    insertSuffix:
      "H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas",
    postMoveCheck:
      "W.restore()}if(_e.config.underline){var _lUlT=",
  },
  {
    label: "Edit Ye Meta",
    blockPrefix: "G.restore();",
    blockStartPattern: "if(D){var _euLT=",
    // The Meta visible pass is preceded by `H.restore()};` (the for-loop
    // body close + semicolon). Use that to disambiguate from the
    // non-Meta branch which has the same `_S.eyebrowContentW>0...` line.
    insertPrefix: "H.restore()};",
    insertSuffix:
      "_S.eyebrowContentW>0&&(H.save(),H.globalAlpha=Re.eyebrow.opacity,H.drawImage(_S.colorCanvas",
    postMoveCheck:
      "H.restore()};if(D){var _euLT=",
  },
  {
    label: "Tc Meta",
    blockPrefix: "n.restore();",
    blockStartPattern: "if(p.underline){var _oUlT=",
    // After the shadow if-block: `n.filter="none"}` (filter reset + close
    // of if(p.shadowEnabled)). Then comes the visible eyebrow draw.
    // Inserting between these places the underline OUTSIDE the
    // shadowEnabled wrapper so it runs even when shadow is off, and
    // with `n.filter="none"` already set — no leftover drop-shadow.
    insertPrefix: "n.filter=\"none\"}",
    insertSuffix:
      "U.eyebrow.w>0&&_dse(n,_srcC,U.eyebrow,",
    postMoveCheck:
      "n.filter=\"none\"}if(p.underline){var _oUlT=",
  },
];

function moveBlock(src, r) {
  if (src.includes(r.postMoveCheck)) {
    console.log(`[patch-underline-zorder-after-text-shadow] ${r.label}: already moved`);
    return src;
  }

  // Locate block at current location.
  const removeAnchor = r.blockPrefix + r.blockStartPattern;
  if (src.split(removeAnchor).length - 1 !== 1) {
    console.error(`[patch-underline-zorder-after-text-shadow] ${r.label}: remove anchor not found / not unique`);
    process.exit(1);
  }
  const idxInBundle = src.indexOf(removeAnchor);
  const blockStart = idxInBundle + r.blockPrefix.length;
  const openBrace = src.indexOf("{", blockStart);
  const blockEnd = findMatchingBrace(src, openBrace);
  if (blockEnd < 0) {
    console.error(`[patch-underline-zorder-after-text-shadow] ${r.label}: brace not balanced`);
    process.exit(1);
  }
  const block = src.slice(blockStart, blockEnd);

  // Verify insert anchor (prefix+suffix) is unique.
  const insertAnchor = r.insertPrefix + r.insertSuffix;
  if (src.split(insertAnchor).length - 1 !== 1) {
    console.error(`[patch-underline-zorder-after-text-shadow] ${r.label}: insert anchor not unique`);
    process.exit(1);
  }

  // Remove block from current location (keep prefix in place).
  src = src.replace(r.blockPrefix + block, r.blockPrefix);

  // Splice block BETWEEN insertPrefix and insertSuffix.
  src = src.replace(insertAnchor, r.insertPrefix + block + r.insertSuffix);

  console.log(`[patch-underline-zorder-after-text-shadow] ${r.label}: moved (${block.length} chars)`);
  return src;
}

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  for (const r of RENDERERS) {
    src = moveBlock(src, r);
  }

  if (src === original) {
    console.log("[patch-underline-zorder-after-text-shadow] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-underline-zorder-after-text-shadow] OK");
}
main();
