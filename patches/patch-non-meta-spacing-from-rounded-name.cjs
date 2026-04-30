/*
 * patch-non-meta-spacing-from-rounded-name.cjs
 *
 * After the spacing-fontsize fix, Meta path computes:
 *   nameY  = Math.round(posY)
 *   titleY = nameY + nameFontSize * metaScale + titleGap
 *   eyeY   = nameY - eyebrowFontSize * metaScale - eyebrowGap
 *
 * But non-Meta path computes each Y from a separate Math.round of a
 * compound expression:
 *   nameY  = Math.round(posY)
 *   titleY = Math.round(posY + nameFontSize + titleGap)
 *   eyeY   = Math.round(posY - eyebrowFontSize - eyebrowGap)
 *
 * For fractional posY, the two rounding strategies can disagree by
 * +/- 1 pixel. Switching from Meta to a non-Meta animation jumps the
 * spacing by that amount. The user explicitly does not want spacing
 * to change on animation switch.
 *
 * Aligns non-Meta to derive eyebrow/title from the rounded name Y:
 *   nameY  = Math.round(posY)
 *   titleY = nameY + nameFontSize + titleGap
 *   eyeY   = nameY - eyebrowFontSize - eyebrowGap
 *
 * Now Meta (at meta-scale=1) and non-Meta produce IDENTICAL Y values,
 * regardless of fractional posY.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  // Live Kt: vars Is/vn/Na/us/Rs/Fa  ($n=eyebrowFontSize, ar=eyebrowGap, Mt=nameFontSize, cs=titleGap)
  [
    "Is=xn?_e.config.posY-$n-ar:0,vn=_e.config.posY,Na=_e.config.posY+Mt+cs,us=Math.round(Is),Rs=Math.round(vn),Fa=Math.round(Na)",
    "vn=_e.config.posY,Rs=Math.round(vn),Is=xn?Rs-$n-ar:0,Na=Rs+Mt+cs,us=Is,Fa=Na",
  ],
  // Edit Ye: vars Xr/qr/aa/ds/qa/Aa  (Vn=eyebrowFontSize, he=eyebrowGap, Va=nameFontSize, re=titleGap)
  [
    "Xr=(n||Ae.current)?ne-Vn-he:0,qr=ne,aa=ne+Va+re,ds=Math.round(Xr),qa=Math.round(qr),Aa=Math.round(aa)",
    "qr=ne,qa=Math.round(qr),Xr=(n||Ae.current)?qa-Vn-he:0,aa=qa+Va+re,ds=Xr,Aa=aa",
  ],
  // Tc renderer: vars Ne/z/K/q/ee/ie  (L=eyebrowFontSize*b, w=eyebrowGap*b, se=nameFontSize*b, T=titleGap*b, _=posY*b)
  [
    "Ne=R?_-L-w:0,z=_,K=_+se+T,q=Math.round(Ne),ee=Math.round(z),ie=Math.round(K)",
    "z=_,ee=Math.round(z),Ne=R?ee-L-w:0,K=ee+se+T,q=Ne,ie=K",
  ],
];

const MARKER = "vn=_e.config.posY,Rs=Math.round(vn),Is=xn?Rs-$n-ar:0";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-non-meta-spacing-from-rounded-name] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-non-meta-spacing-from-rounded-name] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-non-meta-spacing-from-rounded-name] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr.slice(0, 40));
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-non-meta-spacing-from-rounded-name] OK — non-Meta now derives eyebrow/title from rounded name Y");
}
main();
