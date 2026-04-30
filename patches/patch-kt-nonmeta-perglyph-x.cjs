/*
 * patch-kt-nonmeta-perglyph-x.cjs
 *
 * Live `Kt` factory path uses `Oe = Yn ? ln+nr : ln+It.x` for ALL
 * three glyph X positions (Yn=meta, nr=It.x). For Meta this is
 * correct (all three move together), but for non-Meta each element
 * has its own animation X (`pn.x`, `It.x`, `nn.x`) which Kt ignores.
 * Tc factory and Edit Ye direct paths use per-glyph X.
 *
 * Defines per-element X aliases (`_eX`, `_nX`, `_tX`) right after
 * `Oe` and substitutes them into each drawImage and underline path.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Step A: declare per-element X aliases right after `Oe = ...;`
const ALIAS_OLD = "Oe=Yn?ln+nr:ln+It.x;";
const ALIAS_NEW = "Oe=Yn?ln+nr:ln+It.x;const _eX=Yn?Oe:ln+pn.x,_nX=Yn?Oe:ln+It.x,_tX=Yn?Oe:ln+nn.x;";

// Step B: alpha-pass me.drawImage (3 calls, distinguished by H.<el>.x prefix)
const ME_EYE_OLD = "me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G";
const ME_EYE_NEW = "me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,_eX-ke*G";
const ME_NAME_OLD = "me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G";
const ME_NAME_NEW = "me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,_nX-ke*G";
const ME_TITLE_OLD = "me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G";
const ME_TITLE_NEW = "me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,_tX-ke*G";

// Step C: temp canvas drawImage (3 calls)
const MT_EYE_OLD = "_mtLkCtx.globalAlpha=pn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G";
const MT_EYE_NEW = "_mtLkCtx.globalAlpha=pn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,_eX-ke*G";
const MT_NAME_OLD = "_mtLkCtx.globalAlpha=It.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G";
const MT_NAME_NEW = "_mtLkCtx.globalAlpha=It.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,_nX-ke*G";
const MT_TITLE_OLD = "_mtLkCtx.globalAlpha=nn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G";
const MT_TITLE_NEW = "_mtLkCtx.globalAlpha=nn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,_tX-ke*G";

// Step D: underline strokes — eyebrow X formula, name+title X
const UL_EYE_OLD = "const _euX=Oe+(H.eyebrowLogoOffset||0)*G;";
const UL_EYE_NEW = "const _euX=_eX+(H.eyebrowLogoOffset||0)*G;";

// Name underline: 4 occurrences (mt + me, moveTo + lineTo). Use a unique anchor.
const UL_NAME_OLD = "_mtLkCtx.globalAlpha=It.opacity;_mtLkCtx.beginPath();_mtLkCtx.moveTo(Oe,_uny);_mtLkCtx.lineTo(Oe+_nw,_uny);_mtLkCtx.stroke();";
const UL_NAME_NEW = "_mtLkCtx.globalAlpha=It.opacity;_mtLkCtx.beginPath();_mtLkCtx.moveTo(_nX,_uny);_mtLkCtx.lineTo(_nX+_nw,_uny);_mtLkCtx.stroke();";

const UL_TITLE_OLD = "_mtLkCtx.globalAlpha=nn.opacity;_mtLkCtx.beginPath();_mtLkCtx.moveTo(Oe,_uty);_mtLkCtx.lineTo(Oe+_tw,_uty);_mtLkCtx.stroke();";
const UL_TITLE_NEW = "_mtLkCtx.globalAlpha=nn.opacity;_mtLkCtx.beginPath();_mtLkCtx.moveTo(_nX,_uty);_mtLkCtx.lineTo(_nX+_tw,_uty);_mtLkCtx.stroke();";
// Note: title at Y `_uty` but in non-meta should also use `_tX`. Let me re-check.
// Actually title underline should be `_tX`. The OLD says `Oe` for both — so both name and title
// in the OLD use Oe. New uses `_nX` for name and `_tX` for title. Fix the title NEW above.

const UL_TITLE_NEW_CORRECT = "_mtLkCtx.globalAlpha=nn.opacity;_mtLkCtx.beginPath();_mtLkCtx.moveTo(_tX,_uty);_mtLkCtx.lineTo(_tX+_tw,_uty);_mtLkCtx.stroke();";

const UL_NAME_ME_OLD = "me.globalAlpha=It.opacity;me.beginPath();me.moveTo(Oe,_uny);me.lineTo(Oe+_nw,_uny);me.stroke();";
const UL_NAME_ME_NEW = "me.globalAlpha=It.opacity;me.beginPath();me.moveTo(_nX,_uny);me.lineTo(_nX+_nw,_uny);me.stroke();";

const UL_TITLE_ME_OLD = "me.globalAlpha=nn.opacity;me.beginPath();me.moveTo(Oe,_uty);me.lineTo(Oe+_tw,_uty);me.stroke();";
const UL_TITLE_ME_NEW = "me.globalAlpha=nn.opacity;me.beginPath();me.moveTo(_tX,_uty);me.lineTo(_tX+_tw,_uty);me.stroke();";

const MARKER = "const _eX=Yn?Oe:ln+pn.x";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-kt-nonmeta-perglyph-x] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-kt-nonmeta-perglyph-x] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-kt-nonmeta-perglyph-x] already applied");
    return;
  }
  src = applyOnce(src, ALIAS_OLD, ALIAS_NEW, "alias declaration");
  src = applyOnce(src, ME_EYE_OLD, ME_EYE_NEW, "me eyebrow drawImage");
  src = applyOnce(src, ME_NAME_OLD, ME_NAME_NEW, "me name drawImage");
  src = applyOnce(src, ME_TITLE_OLD, ME_TITLE_NEW, "me title drawImage");
  src = applyOnce(src, MT_EYE_OLD, MT_EYE_NEW, "_mtLkCtx eyebrow drawImage");
  src = applyOnce(src, MT_NAME_OLD, MT_NAME_NEW, "_mtLkCtx name drawImage");
  src = applyOnce(src, MT_TITLE_OLD, MT_TITLE_NEW, "_mtLkCtx title drawImage");
  src = applyOnce(src, UL_EYE_OLD, UL_EYE_NEW, "underline eyebrow X");
  src = applyOnce(src, UL_NAME_OLD, UL_NAME_NEW, "underline mt name");
  src = applyOnce(src, UL_TITLE_OLD, UL_TITLE_NEW_CORRECT, "underline mt title");
  src = applyOnce(src, UL_NAME_ME_OLD, UL_NAME_ME_NEW, "underline me name");
  src = applyOnce(src, UL_TITLE_ME_OLD, UL_TITLE_ME_NEW, "underline me title");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-kt-nonmeta-perglyph-x] OK — Live Kt factory now uses per-glyph X");
}
main();
