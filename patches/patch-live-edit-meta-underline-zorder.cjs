/*
 * patch-live-edit-meta-underline-zorder.cjs
 *
 * Same z-order fix the Tc Meta path got — extended to the Live and
 * Edit per-frame renderers. The underline block was drawn AFTER the
 * visible text passes, so its shadow could bleed up into the text
 * region and visibly cover the glyphs. We hoist the entire
 * `if(_e.config.underline){...}` block (Live `Kt`) and the
 * `if(D){var _euLT=...}` block (Edit `Ye` Meta branch) to BEFORE the
 * shadow loop on the color context. Order becomes:
 *
 *   underline + its shadow → text shadow loop → visible text passes
 *
 * The text passes still cover any underline-shadow that happens to
 * fall inside the text bounding box. Each underline block already
 * resets `shadow*` to 0 at the end, so the subsequent text shadow
 * loop starts from clean state.
 *
 * Important syntactic detail: the line preceding the shadow-loop
 * anchors looks like `me.restore();var _shF=...` (Live) and
 * `G.restore();if(z){var _shFM=...` (Edit). Both are statements
 * separated by `;`. We must insert the block AFTER that `;`, not
 * inside the preceding comma-expression sequence — otherwise we
 * splice an `if`-statement into the middle of a comma chain and
 * the bundle won't parse. We split each anchor into a `prefix`
 * (everything up through the `;`) and a `suffix` (the next
 * statement we anchor against), and insert the block between them.
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

// Anchors describing each renderer's underline block + insert position.
const RENDERERS = [
  {
    label: "Live Kt",
    // Block to move
    blockPrefix: "W.restore();",                        // chars right before `if(...)` on remove-side
    blockStartPattern: "if(_e.config.underline){var _lUlT=",
    // Insert position: split into [insertPrefix][insertSuffix].
    // The `;` after `me.restore()` ends the alpha-pass expression sequence,
    // so the underline block must land AFTER the `;`.
    insertPrefix: "me.restore();",
    insertSuffix: "var _shF=(_e.config.shadowEnabled??!1)?function(){",
    // Detect post-move state by absence of remove-side anchor + presence of
    // the prefix+if(... combination at the insert site.
    postMoveCheck: "me.restore();if(_e.config.underline){var _lUlT=",
  },
  {
    label: "Edit Ye Meta",
    blockPrefix: "H.globalAlpha=1,G.globalAlpha=1;",
    blockStartPattern: "if(D){var _euLT=",
    // Edit's shadow loop anchor begins with `if(z){...` directly following
    // a `;` (after `G.restore();`). No prefix split needed — we just
    // prepend the block before `if(z){`.
    insertPrefix: "",
    insertSuffix: "if(z){var _shFM=function(){",
    postMoveCheck: "}if(z){var _shFM=function(){",
  },
];

function moveBlock(src, r) {
  // Already moved?
  if (src.includes(r.postMoveCheck)) {
    console.log(`[patch-live-edit-meta-underline-zorder] ${r.label}: already moved`);
    return src;
  }

  // Locate the block in its current location (right after blockPrefix).
  const removeAnchor = r.blockPrefix + r.blockStartPattern;
  const idxInBundle = src.indexOf(removeAnchor);
  if (idxInBundle < 0) {
    console.error(`[patch-live-edit-meta-underline-zorder] ${r.label}: remove anchor not found`);
    process.exit(1);
  }
  if (src.split(removeAnchor).length - 1 !== 1) {
    console.error(`[patch-live-edit-meta-underline-zorder] ${r.label}: remove anchor not unique`);
    process.exit(1);
  }
  const blockStart = idxInBundle + r.blockPrefix.length;
  // First `{` at-or-after blockStart is the opening brace of `if(...){...}`.
  const openBrace = src.indexOf("{", blockStart);
  if (openBrace < 0) {
    console.error(`[patch-live-edit-meta-underline-zorder] ${r.label}: opening '{' not found`);
    process.exit(1);
  }
  const blockEnd = findMatchingBrace(src, openBrace);
  if (blockEnd < 0) {
    console.error(`[patch-live-edit-meta-underline-zorder] ${r.label}: brace not balanced`);
    process.exit(1);
  }
  const block = src.slice(blockStart, blockEnd); // `if(...){...}`

  // Verify insert anchor uniqueness.
  const insertAnchor = r.insertPrefix + r.insertSuffix;
  const ic = src.split(insertAnchor).length - 1;
  if (ic !== 1) {
    console.error(`[patch-live-edit-meta-underline-zorder] ${r.label}: insert anchor not unique (${ic})`);
    process.exit(1);
  }

  // 1) Remove block (keep blockPrefix in place).
  src = src.replace(r.blockPrefix + block, r.blockPrefix);

  // 2) Insert block between insertPrefix and insertSuffix.
  src = src.replace(insertAnchor, r.insertPrefix + block + r.insertSuffix);

  console.log(`[patch-live-edit-meta-underline-zorder] ${r.label}: moved (${block.length} chars)`);
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
    console.log("[patch-live-edit-meta-underline-zorder] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-live-edit-meta-underline-zorder] OK");
}
main();
