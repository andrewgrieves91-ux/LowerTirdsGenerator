/*
 * patch-bold-overrides-title-weight.cjs
 *
 * Title weight selection in all 3 factories and 3 renderers picks
 * `titleFontWeight` if it's set, even when the user has toggled
 * `bold` on. Result: the title line stays at its custom weight
 * while eyebrow/name go bold. The user expects bold to override
 * title's custom weight.
 *
 * Fix in factories (which produce the rendered colorCanvas with
 * baked-in glyph weight) AND in renderers (which compute font
 * templates for measureText/strokeText/fillText paths):
 *
 *   K  factory : `_e = V.config.titleFontWeight || Kt`
 *                -> `_e = V.config.bold ? "700" : V.config.titleFontWeight || Kt`
 *   xR factory : `C = v || j`
 *                -> `C = m ? "700" : v || j`           (m = bold flag)
 *   _c factory : `E = i.titleFontWeight || x`
 *                -> `E = i.bold ? "700" : i.titleFontWeight || x`
 *
 *   Live Kt    : `zn = Yn&&_e.config.titleFontWeight ? _e.config.titleFontWeight : rn`
 *                -> `zn = _e.config.bold ? "700" : Yn&&_e.config.titleFontWeight ? _e.config.titleFontWeight : rn`
 *   Edit Ye    : `Xe = At==="meta"&&N ? N : ke`
 *                -> `Xe = C ? "700" : At==="meta"&&N ? N : ke`           (C = bold flag)
 *   Tc Meta    : `j = p.animationType==="meta"&&p.titleFontWeight ? ... : N`
 *                -> `j = p.bold ? "700" : p.animationType==="meta"&&p.titleFontWeight ? ... : N`
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  // Factories
  ["_e=V.config.titleFontWeight||Kt",
   '_e=V.config.bold?"700":V.config.titleFontWeight||Kt'],
  ['const j=m?"700":f,C=v||j,',
   'const j=m?"700":f,C=m?"700":v||j,'],
  ["E=i.titleFontWeight||x,",
   'E=i.bold?"700":i.titleFontWeight||x,'],

  // Renderers
  ["zn=Yn&&_e.config.titleFontWeight?_e.config.titleFontWeight:rn,",
   'zn=_e.config.bold?"700":Yn&&_e.config.titleFontWeight?_e.config.titleFontWeight:rn,'],
  ['ke=C?"700":w,Xe=At==="meta"&&N?N:ke,',
   'ke=C?"700":w,Xe=C?"700":At==="meta"&&N?N:ke,'],
  ['j=p.animationType==="meta"&&p.titleFontWeight?p.titleFontWeight:N,',
   'j=p.bold?"700":p.animationType==="meta"&&p.titleFontWeight?p.titleFontWeight:N,'],
];

const MARKER = '_e=V.config.bold?"700":V.config.titleFontWeight||Kt';

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-bold-overrides-title-weight] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-bold-overrides-title-weight] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-bold-overrides-title-weight] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr.slice(0, 40));
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-bold-overrides-title-weight] OK — bold now overrides titleFontWeight in all paths");
}
main();
