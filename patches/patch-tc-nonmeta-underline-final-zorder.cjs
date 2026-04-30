/*
 * patch-tc-nonmeta-underline-final-zorder.cjs
 *
 * Tc non-Meta export path: the underline block was moved to BEFORE
 * the if(xe){letterOpacities}else{shadow loop} branches by
 * `patch-tc-nonmeta-underline-shadow-and-zorder.cjs`. That removed
 * the original "underline shadow over text" issue but exposed the
 * inverse — the text shadow loop's drop-shadow output paints over
 * the underline.
 *
 * Final position: AFTER both branches AND the post-branches cleanup
 * (`n.shadowBlur=0;n.filter="none";if(_xLI){<logo>}`), but BEFORE
 * the closing `n.restore()}` that ends the Tc function. This puts
 * underline strokes on top of EVERYTHING, including the text+shadow
 * composite from the for-loop. User explicitly asked for the
 * underline to be ABOVE the shadow.
 *
 * Trade-off: any underline-shadow that bleeds upward into the text
 * region will now sit visibly on top of the text. In Tc non-Meta
 * the text is rendered together with its drop-shadow inside the
 * for-loop (no separate "visible text" pass like Live Kt has), so
 * we can't insert the underline BETWEEN the two layers. User has
 * accepted this trade-off.
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

// Where the block currently sits — between `Te=E;` and `if(xe){`.
const OLD_PREFIX = "Te=E;";
const OLD_BLOCK_START = "if(p.underline){";
// Final destination: between `if(_xLI){...n.restore()}` and the closing
// `}async function vb(` (which marks the very end of Tc).
const NEW_PREFIX = "n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH);n.restore()}";
const NEW_SUFFIX = "n.restore()}async function vb(";

const POST_MOVE_CHECK = "n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH);n.restore()}if(p.underline){";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(POST_MOVE_CHECK)) {
    console.log("[patch-tc-nonmeta-underline-final-zorder] already applied");
    return;
  }

  // Locate the underline block at its current position.
  const removeAnchor = OLD_PREFIX + OLD_BLOCK_START;
  if (src.split(removeAnchor).length - 1 !== 1) {
    console.error("[patch-tc-nonmeta-underline-final-zorder] remove anchor not found / not unique");
    process.exit(1);
  }
  const idxInBundle = src.indexOf(removeAnchor);
  const blockStart = idxInBundle + OLD_PREFIX.length;
  const openBrace = src.indexOf("{", blockStart);
  const blockEnd = findMatchingBrace(src, openBrace);
  if (blockEnd < 0) {
    console.error("[patch-tc-nonmeta-underline-final-zorder] brace not balanced");
    process.exit(1);
  }
  const block = src.slice(blockStart, blockEnd);

  // Ensure the destination anchor is unique.
  const insertAnchor = NEW_PREFIX + NEW_SUFFIX;
  if (src.split(insertAnchor).length - 1 !== 1) {
    console.error("[patch-tc-nonmeta-underline-final-zorder] insert anchor not unique");
    process.exit(1);
  }

  // Remove from current location.
  src = src.replace(OLD_PREFIX + block, OLD_PREFIX);

  // Splice in at the new location, between NEW_PREFIX and NEW_SUFFIX.
  src = src.replace(insertAnchor, NEW_PREFIX + block + NEW_SUFFIX);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(`[patch-tc-nonmeta-underline-final-zorder] OK — moved (${block.length} chars)`);
}
main();
