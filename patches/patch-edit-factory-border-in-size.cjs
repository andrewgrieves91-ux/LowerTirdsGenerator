/*
 * patch-edit-factory-border-in-size.cjs
 *
 * Edit factory `xR()` doesn't add the scaled border width to either
 * the W or the H of any region. Live `K()` adds it to both, and
 * Export `_c()` adds it to the W (separate patch fixes _c heights).
 *
 * Without this padding, a cue with a thick border draws into a
 * smaller content rectangle in Edit than in Live/Export, clipping
 * the stroke and shifting the underline below the visible glyphs.
 *
 * Edit uses:
 *   `_` — the already-scaled border width (mutated as `_=_*_XRS`)
 *   `b` — the borderEnabled flag
 *
 * So the term to add is `(b?_:0)` — equivalent to Live's `_bw`.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  // Eyebrow width: $ = Math.ceil(he+re+F)+4
  ["$=Math.ceil(he+re+F)+4", "$=Math.ceil(he+re+F)+4+(b?_:0)"],
  // Eyebrow height: I = Math.ceil(L)+4
  ["I=Math.ceil(L)+4", "I=Math.ceil(L)+4+(b?_:0)"],
  // Name width: ve = Math.ceil((...)())+4 — anchor by the )()) +4 bit and the var name
  ["})())+4,Ne=Math.ceil(M)+4", "})())+4+(b?_:0),Ne=Math.ceil(M)+4+(b?_:0)"],
  // Title width + height
  ["})())+4,K=Math.ceil(se)+4", "})())+4+(b?_:0),K=Math.ceil(se)+4+(b?_:0)"],
];
const MARKER = "$=Math.ceil(he+re+F)+4+(b?_:0)";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-edit-factory-border-in-size] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-factory-border-in-size] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-edit-factory-border-in-size] already applied");
    return;
  }
  for (const [oldStr, newStr] of REPLACEMENTS) {
    src = applyOnce(src, oldStr, newStr, oldStr.slice(0, 25));
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-factory-border-in-size] OK — Edit factory now adds border to W and H");
}
main();
