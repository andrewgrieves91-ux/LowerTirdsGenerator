/*
 * patch-export-factory-border-in-height.cjs
 *
 * Export factory `_c()` adds the scaled border width to W of each
 * region but NOT to H. Live `K()` adds it to both. Without the H
 * padding, a thick border clips top/bottom of glyphs in the export
 * frame (and `Tc` then composites a clipped colorCanvas).
 *
 * Brings _c heights in line with widths.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const BORDER_TERM = "+(i.borderEnabled?(i.borderWidth||2)*_RS:0)";

const REPLACEMENTS = [
  // Eyebrow height: B=Math.ceil(p)+4
  ["B=Math.ceil(p)+4", "B=Math.ceil(p)+4" + BORDER_TERM],
  // Name height: M=Math.ceil(m)+4
  ["M=Math.ceil(m)+4", "M=Math.ceil(m)+4" + BORDER_TERM],
  // Title height: se=Math.ceil(v)+4
  ["se=Math.ceil(v)+4", "se=Math.ceil(v)+4" + BORDER_TERM],
];
const MARKER = "B=Math.ceil(p)+4+(i.borderEnabled?(i.borderWidth||2)*_RS:0)";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-export-factory-border-in-height] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-export-factory-border-in-height] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-export-factory-border-in-height] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr);
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-export-factory-border-in-height] OK — Export heights now include border");
}
main();
