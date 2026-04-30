/*
 * patch-tc-x-no-round.cjs
 *
 * Tc direct (letter-opacity) path rounds X positions while Kt/Ye
 * never round X. Drops the rounding in Tc to match.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const OLD =
  "const U=M?te:Math.round(te+D.x*b),Q=M?te:Math.round(te+B.x*b),oe=M?te:Math.round(te+k.x*b);";
const NEW =
  "const U=M?te:te+D.x*b,Q=M?te:te+B.x*b,oe=M?te:te+k.x*b;";

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(NEW) && !src.includes(OLD)) {
    console.log("[patch-tc-x-no-round] already applied");
    return;
  }
  const n = src.split(OLD).length - 1;
  if (n === 0) {
    console.error("[patch-tc-x-no-round] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-tc-x-no-round] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(OLD, NEW);
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-tc-x-no-round] OK — Tc direct X positions no longer rounded");
}
main();
