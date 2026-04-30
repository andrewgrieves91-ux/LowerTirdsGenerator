/*
 * patch-tc-shadow-color-coalesce.cjs
 *
 * Tc uses `p.shadowColor || "#000000"` in some shadow paths and
 * `p.shadowColor ?? "#000000"` in others. Live and Edit always use
 * `??`. The difference: `||` treats an empty string as falsy and
 * falls back to black, while `??` only falls back when the value is
 * null/undefined.
 *
 * Aligns Tc to use `??` everywhere.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const OLD = 'p.shadowColor||"#000000"';
const NEW = 'p.shadowColor??"#000000"';

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  // Already-applied detection: zero `||` remain.
  if (!src.includes(OLD)) {
    console.log("[patch-tc-shadow-color-coalesce] already applied");
    return;
  }
  const before = src.split(OLD).length - 1;
  src = src.split(OLD).join(NEW);
  const after = src.split(OLD).length - 1;
  if (after !== 0) {
    console.error("[patch-tc-shadow-color-coalesce] some occurrences remain");
    process.exit(1);
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(`[patch-tc-shadow-color-coalesce] OK — replaced ${before} occurrence(s) of || with ??`);
}
main();
