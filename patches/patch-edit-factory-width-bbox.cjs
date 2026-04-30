/*
 * patch-edit-factory-width-bbox.cjs
 *
 * Edit factory `xR()` measures text width with `.measureText(...).width`
 * only. Live `K()` and Export `_c()` use
 * `Math.max(m.width, m.actualBoundingBoxRight || 0)` so italic / decorative
 * glyphs that overhang their advance width are not clipped or undersized.
 * Brings Edit in line.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Eyebrow: `const he=a?ue.measureText(a).width:0`
// Replace with helper that captures the metrics.
const OLD_EYE = "const he=a?ue.measureText(a).width:0";
const NEW_EYE = 'const he=a?(()=>{const _m=ue.measureText(a);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})():0';

// Name: `const ve=Math.ceil(ue.measureText(r).width)+4`
const OLD_NAME = "const ve=Math.ceil(ue.measureText(r).width)+4";
const NEW_NAME = 'const ve=Math.ceil((()=>{const _m=ue.measureText(r);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4';

// Title: `const z=Math.ceil(ue.measureText(n).width)+4`
const OLD_TITLE = "const z=Math.ceil(ue.measureText(n).width)+4";
const NEW_TITLE = 'const z=Math.ceil((()=>{const _m=ue.measureText(n);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4';

// Edit-specific marker (Edit's eyebrow uses `ue` measure ctx + `he` const)
const MARKER = "const he=a?(()=>{const _m=ue.measureText(a)";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-edit-factory-width-bbox] ${label} anchor not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-factory-width-bbox] ${label} anchor not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-edit-factory-width-bbox] already applied");
    return;
  }
  src = applyOnce(src, OLD_EYE, NEW_EYE, "eyebrow");
  src = applyOnce(src, OLD_NAME, NEW_NAME, "name");
  src = applyOnce(src, OLD_TITLE, NEW_TITLE, "title");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-factory-width-bbox] OK — Edit factory now uses Math.max(width, actualBoundingBoxRight)");
}
main();
