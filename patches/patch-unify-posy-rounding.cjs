/*
 * patch-unify-posy-rounding.cjs
 *
 * Three different rounding strategies for posY in Meta path:
 *   - Kt: `_Ga = _e.config.posY`           (raw)
 *   - Ye: `_nameY = qa` (= `Math.round(ne)`)  (rounded — already)
 *   - Tc: `Qe = _` (= `p.posY*b`)            (raw)
 *
 * Up to half a pixel of vertical drift between renderers. Standardize
 * on `Math.round` so all three produce the same integer Y for the
 * name (eyebrow/title are computed from name + content height, so they
 * inherit the same alignment).
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Live Kt: `_Ga=_e.config.posY` -> `_Ga=Math.round(_e.config.posY)`
const KT_OLD = "_Ga=_e.config.posY;";
const KT_NEW = "_Ga=Math.round(_e.config.posY);";

// Tc Meta: `Qe=_;` (inside `if(M){oe=E+he;Qe=_;...}`) -> `Qe=Math.round(_);`
// Anchor unique by the `if(M){oe=E+he;` prefix.
const TC_OLD = "if(M){oe=E+he;Qe=_;";
const TC_NEW = "if(M){oe=E+he;Qe=Math.round(_);";

const MARKER = "_Ga=Math.round(_e.config.posY)";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-unify-posy-rounding] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-unify-posy-rounding] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-unify-posy-rounding] already applied");
    return;
  }
  src = applyOnce(src, KT_OLD, KT_NEW, "Live Kt _Ga");
  src = applyOnce(src, TC_OLD, TC_NEW, "Tc Meta Qe");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-unify-posy-rounding] OK — Kt and Tc Meta now round posY like Ye");
}
main();
