/*
 * patch-spacing-fontsize-not-contenth.cjs
 *
 * The Meta path's vertical spacing formula in all three renderers
 * uses the factory's `nameContentH * G` (etc.) which includes:
 *   - the font-size pixel height
 *   - +4 padding
 *   - the scaled border width
 *
 * So when the user increases the border, eyebrow moves UP and title
 * moves DOWN — the user explicitly does NOT want this. Spacing should
 * depend only on the font size and the gap setting.
 *
 * Replaces `nameContentH * G` with `<nameFontSize> * <metaScale>` and
 * `eyebrowContentH * G` with `<eyebrowFontSize> * <metaScale>` in:
 *   - Live  Kt  (vars: mn = nameFontSize, os = eyebrowFontSize, tr = metaScale)
 *   - Edit  Ye  (vars: Fn = nameFontSize, fa = eyebrowFontSize, na = metaScale)
 *   - Tc Meta   (vars: re = nameFontSize*b, fe = eyebrowFontSize*b, ue = metaScale)
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  // Live Kt
  ["_fa=_Ga+H.nameContentH*G+Re", "_fa=_Ga+mn*tr+Re"],
  ["_Fn=_Ga-H.eyebrowContentH*G-Ye", "_Fn=_Ga-os*tr-Ye"],
  // Edit Ye
  ["_titleY=_nameY+_S.nameContentH*_G+re", "_titleY=_nameY+Fn*na+re"],
  ["_eyeY=_nameY-_S.eyebrowContentH*_G-he", "_eyeY=_nameY-fa*na-he"],
  // Tc Meta
  ["$e=Qe+(U.nameContentH||U.name.h)*Q+T", "$e=Qe+re*ue+T"],
  ["zt=Qe-(U.eyebrowContentH||U.eyebrow.h)*Q-w", "zt=Qe-fe*ue-w"],
];

const MARKER = "_fa=_Ga+mn*tr+Re";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-spacing-fontsize-not-contenth] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-spacing-fontsize-not-contenth] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-spacing-fontsize-not-contenth] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr.slice(0, 35));
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-spacing-fontsize-not-contenth] OK — Meta spacing now depends on font size only, not border");
}
main();
