/*
 * patch-tc-nonmeta-underline-shadow-and-zorder.cjs
 *
 * The Tc non-Meta underline block (used by every animation type
 * except Meta in Export) had two problems:
 *
 *   1. No shadow at all. The Meta variant already builds a
 *      drop-shadow filter from `p.shadowColor`/`shadowBlur`/etc.;
 *      the non-Meta variant just forced `n.filter="none"` and went
 *      straight to strokeText. So users see a sharp underline with
 *      zero shadow on every non-Meta animation.
 *
 *   2. Z-order: the block was drawn at the very END of Tc — after
 *      the text shadow loop and visible passes, after the logo
 *      final-draw. Meaning even if a shadow had been there, it
 *      would have bled UP onto the already-drawn text.
 *
 * Fix:
 *   - Replace the old `if(p.underline){...}` block with a new one
 *     that mirrors the Meta version's shadow setup (same shadow*
 *     properties on context n, computed from `p.shadowColor`,
 *     `p.shadowBlur`, `p.shadowOffsetX/Y`, `p.shadowStrength`).
 *   - Hoist that block to BEFORE the if(xe){...}else{...} branch
 *     (i.e. right after the `te=E,Te=E;` declaration where the
 *     vars `te`, `Te` it relies on come from).
 *   - The block ends with `shadow*=0` resets so the subsequent
 *     text shadow setup (inside the else branch) starts from a
 *     clean state.
 *
 * Variables used by the new block — all in scope at the insertion
 * point:
 *   p        Tc closure: r.config
 *   b        Tc closure: render scale Math.min(a/oo, l/co)
 *   n        Tc closure: the target context
 *   M        Tc closure: p.animationType==="meta" flag
 *   R        Tc closure: p.eyebrow ?? ""
 *   $, I, ve Tc closure: font strings (eyebrow / name / title)
 *   q, ee, ie, fe, re, F   Tc closure: rounded x/y geometry
 *   te, Te   declared right at the insertion-point's left edge
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Old underline block — found via this exact prefix; ends at balanced `}`.
const OLD_PREFIX = 'if(p.underline){n.filter="none";var _oUlT2=';

// Where to insert the new (shadowed) block. Must be after `Te=E;` so that
// `te` and `Te` are defined when our block runs.
const INSERT_ANCHOR = "k.letterOpacities,te=E,Te=E;if(xe){";

// New block. Same stroke geometry as the original; adds the shadow setup
// at the top and resets shadow* at the bottom. Use unique local names
// (`_uHX`, `_uR`, ...) so they don't clash with any other patch's locals.
const NEW_BLOCK =
  'if(p.underline){' +
    'n.filter="none";' +
    'if(p.shadowEnabled){' +
      'var _uHX=p.shadowColor??"#000000",' +
          '_uR=parseInt(_uHX.slice(1,3),16)||0,' +
          '_uG=parseInt(_uHX.slice(3,5),16)||0,' +
          '_uB=parseInt(_uHX.slice(5,7),16)||0,' +
          '_uA=Math.min((p.shadowStrength??100)/100,1);' +
      'n.shadowBlur=(p.shadowBlur??10)*b;' +
      'n.shadowOffsetX=(p.shadowOffsetX??0)*b;' +
      'n.shadowOffsetY=(p.shadowOffsetY??0)*b;' +
      'n.shadowColor="rgba("+_uR+","+_uG+","+_uB+","+_uA+")"' +
    '}else{' +
      'n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0' +
    '}' +
    'var _oUlT2=(p.underlineThickness??2)*b,_oUlO2=(p.underlineOffset??2)*b;' +
    'const we=M?Te:te;' +
    'if(R){' +
      'n.font=$;' +
      'const _ew=n.measureText(R).width,_euy=q+fe+_oUlO2;' +
      'n.strokeStyle=p.color,n.lineWidth=_oUlT2,n.globalAlpha=1,' +
      'n.beginPath(),n.moveTo(we,_euy),n.lineTo(we+_ew,_euy),n.stroke()' +
    '}' +
    'n.font=I;' +
    'const U=n.measureText(p.name).width;' +
    'n.font=ve;' +
    'const Q=n.measureText(p.title).width;' +
    'n.strokeStyle=p.color,n.lineWidth=_oUlT2,n.globalAlpha=1;' +
    'const oe=ee+re+_oUlO2,le=ie+F+_oUlO2;' +
    'n.beginPath(),n.moveTo(we,oe),n.lineTo(we+U,oe),n.moveTo(we,le),n.lineTo(we+Q,le),n.stroke();' +
    'n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0' +
  '}';

// Idempotency: presence of the new block at the new location.
const MARKER = "Te=E;" + NEW_BLOCK.slice(0, 80); // distinctive enough to detect
const SHORT_MARKER = "Te=E;if(p.underline){n.filter=\"none\";if(p.shadowEnabled){var _uHX=";

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

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(SHORT_MARKER)) {
    console.log("[patch-tc-nonmeta-underline-shadow-and-zorder] already applied");
    return;
  }

  // --- 1) Find + remove the OLD non-Meta underline block ---------------
  const oldStart = src.indexOf(OLD_PREFIX);
  if (oldStart < 0) {
    console.error("[patch-tc-nonmeta-underline-shadow-and-zorder] OLD block not found");
    process.exit(1);
  }
  if (src.split(OLD_PREFIX).length - 1 !== 1) {
    console.error("[patch-tc-nonmeta-underline-shadow-and-zorder] OLD prefix not unique");
    process.exit(1);
  }
  const oldOpenBrace = src.indexOf("{", oldStart);
  const oldEnd = findMatchingBrace(src, oldOpenBrace);
  if (oldEnd < 0) {
    console.error("[patch-tc-nonmeta-underline-shadow-and-zorder] OLD block brace not balanced");
    process.exit(1);
  }
  const oldBlock = src.slice(oldStart, oldEnd);
  src = src.replace(oldBlock, "");
  console.log(`[patch-tc-nonmeta-underline-shadow-and-zorder] removed OLD block (${oldBlock.length} chars)`);

  // --- 2) Insert the NEW block at the if(xe) anchor --------------------
  if (src.split(INSERT_ANCHOR).length - 1 !== 1) {
    console.error("[patch-tc-nonmeta-underline-shadow-and-zorder] insert anchor not unique");
    process.exit(1);
  }
  const newAnchor = INSERT_ANCHOR.replace("if(xe){", NEW_BLOCK + "if(xe){");
  src = src.replace(INSERT_ANCHOR, newAnchor);
  console.log(`[patch-tc-nonmeta-underline-shadow-and-zorder] inserted NEW block (${NEW_BLOCK.length} chars)`);

  if (src === original) {
    console.log("[patch-tc-nonmeta-underline-shadow-and-zorder] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-tc-nonmeta-underline-shadow-and-zorder] OK");
}
main();
