/*
 * patch-underline-zorder-after-visible-text.cjs
 *
 * Final z-order for the underline in all three Meta-path renderers:
 * draw it AFTER the visible text passes (which drawImage the
 * factory's colorCanvas — and that canvas contains the rendered
 * border). Previously the underline was placed BETWEEN the text
 * shadow loop and the visible passes; with a thick border, the
 * visible drawImage was overpainting the underline because the
 * border's pixels in colorCanvas extend past the glyph outline
 * into the underline strip.
 *
 * New order per renderer:
 *
 *   1. Text shadow loop (drop-shadow filter on colorCanvas)
 *   2. Visible text passes (drawImage colorCanvas, includes border)
 *   3. Underline + its own shadow            <-- ON TOP
 *
 * Trade-off: any underline-shadow that bleeds upward into the text
 * region now sits above the text. User has explicitly prioritised
 * "underline above border" and accepts this trade-off.
 *
 * For each renderer, we EXTRACT the existing underline block from
 * its current position (between shadow loop and visible passes,
 * placed by `patch-underline-zorder-after-text-shadow.cjs`) and
 * SPLICE it in just after the visible title pass, before the
 * cleanup statements that restore globalAlpha and close out the
 * render block.
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
    blockPrefix: "W.restore()}",
    blockStartPattern: "if(_e.config.underline){var _lUlT=",
    // After visible title: `H.title.h*G),W.restore();` then `W.globalAlpha=1,...`
    insertPrefix: "H.title.h*G),W.restore();",
    insertSuffix: "W.globalAlpha=1,me.globalAlpha=1,W.restore(),me.restore()",
    // The `;;` is the existing `;` from W.restore(); plus our injected `;`
    // (an empty statement between them — harmless).
    postMoveCheck: "H.title.h*G),W.restore();;if(_e.config.underline){var _lUlT=",
  },
  {
    label: "Edit Ye Meta",
    blockPrefix: "H.restore()};",
    blockStartPattern: "if(D){var _euLT=",
    // After visible Meta title: `_S.title.h*_G),H.restore()` then `}else{` (close
    // Meta path, start non-Meta else). Insert underline INSIDE the Meta path
    // (before the closing `}`). The leading `;` we always inject becomes the
    // statement separator between H.restore() and the if(D){...} block.
    insertPrefix: "_S.title.h*_G),H.restore()",
    insertSuffix: "}else{",
    postMoveCheck: "_S.title.h*_G),H.restore();if(D){var _euLT=",
  },
  {
    label: "Tc Meta",
    blockPrefix: "n.filter=\"none\"}",
    blockStartPattern: "if(p.underline){var _oUlT=",
    // After visible title `_dse(...)` and before `;n.globalAlpha=1;;return`.
    // Leading `;` we inject terminates the `_dse()` expression statement so
    // the if(p.underline){...} block can begin cleanly.
    insertPrefix: "_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity)",
    insertSuffix: ";n.globalAlpha=1",
    postMoveCheck: "_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);if(p.underline){var _oUlT=",
  },
];

function moveBlock(src, r) {
  if (src.includes(r.postMoveCheck)) {
    console.log(`[patch-underline-zorder-after-visible-text] ${r.label}: already moved`);
    return src;
  }

  const removeAnchor = r.blockPrefix + r.blockStartPattern;
  if (src.split(removeAnchor).length - 1 !== 1) {
    console.error(`[patch-underline-zorder-after-visible-text] ${r.label}: remove anchor not found / not unique`);
    process.exit(1);
  }
  const idxInBundle = src.indexOf(removeAnchor);
  const blockStart = idxInBundle + r.blockPrefix.length;
  const openBrace = src.indexOf("{", blockStart);
  const blockEnd = findMatchingBrace(src, openBrace);
  if (blockEnd < 0) {
    console.error(`[patch-underline-zorder-after-visible-text] ${r.label}: brace not balanced`);
    process.exit(1);
  }
  const block = src.slice(blockStart, blockEnd);

  const insertAnchor = r.insertPrefix + r.insertSuffix;
  if (src.split(insertAnchor).length - 1 !== 1) {
    console.error(`[patch-underline-zorder-after-visible-text] ${r.label}: insert anchor not unique`);
    process.exit(1);
  }

  src = src.replace(r.blockPrefix + block, r.blockPrefix);
  // Always insert a leading `;` before the moved block so it lands as a
  // separate statement after the preceding expression. Live Kt's
  // insertPrefix already ends in `;` (a leading `;` here just produces an
  // empty statement, which is valid JS); Edit Ye Meta and Tc Meta need
  // the `;` to terminate the expression that precedes the underline if-
  // statement (e.g. `H.restore()if(D){...}` is a parse error, but
  // `H.restore();if(D){...}` is fine).
  src = src.replace(insertAnchor, r.insertPrefix + ";" + block + r.insertSuffix);

  console.log(`[patch-underline-zorder-after-visible-text] ${r.label}: moved (${block.length} chars)`);
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
    console.log("[patch-underline-zorder-after-visible-text] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-underline-zorder-after-visible-text] OK");
}
main();
