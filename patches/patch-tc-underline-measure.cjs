/*
 * patch-tc-underline-measure.cjs
 *
 * Tc Meta underline path measures text width at the base font size
 * and multiplies by `ue` (the meta scale). Live Kt and Edit Ye both
 * set the staging context's font to the meta-scaled size BEFORE
 * measuring. Because advance-width rounding/kerning is non-linear
 * in font size, `measureText(text, baseSize) * scale` differs from
 * `measureText(text, baseSize*scale)` for many fonts. Aligns Tc to
 * the Kt/Ye approach.
 *
 * Also: the existing `_mtUlT = (...) * b * ue` thickness is correct;
 * we keep it. Only the font set + measure changes.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  // Eyebrow:
  // OLD: `_mtCtx.font=$;const _mtEw=_mtCtx.measureText(R).width*ue;`
  // NEW: `_mtCtx.font=`${C} ${N} ${fe*ue}px "${p.font}", sans-serif`;const _mtEw=_mtCtx.measureText(R).width;`
  [
    "_mtCtx.font=$;const _mtEw=_mtCtx.measureText(R).width*ue;",
    '_mtCtx.font=`${C} ${N} ${fe*ue}px "${p.font}", sans-serif`;const _mtEw=_mtCtx.measureText(R).width;',
  ],
  // Name:
  [
    "_mtCtx.font=I;const _mtNw=_mtCtx.measureText(p.name).width*ue;",
    '_mtCtx.font=`${C} ${N} ${re*ue}px "${p.font}", sans-serif`;const _mtNw=_mtCtx.measureText(p.name).width;',
  ],
  // Title:
  [
    "_mtCtx.font=ve;const _mtTw=_mtCtx.measureText(p.title).width*ue;",
    '_mtCtx.font=`${C} ${j} ${F*ue}px "${p.font}", sans-serif`;const _mtTw=_mtCtx.measureText(p.title).width;',
  ],
];
const MARKER = "_mtCtx.font=`${C} ${N} ${fe*ue}px";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-tc-underline-measure] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-tc-underline-measure] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-tc-underline-measure] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr.slice(0, 30));
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-tc-underline-measure] OK — Tc underline measureText now matches Kt/Ye");
}
main();
