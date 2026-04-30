/*
 * patch-edit-shadow-iter-tune.cjs
 *
 * Applies the same shadow build-up reduction (`/10 → /15` divisor)
 * to the Edit page `Ye` per-frame renderer's two shadow iteration
 * loops:
 *   - Meta branch:    `for(var _bp=0;_bp<Math.max(1,Math.ceil(q/10))...)`
 *   - non-Meta branch: same anchor pattern, different surrounding
 *     `H.filter=_shFNM` body
 *
 * Both use the local var `q` for `config.shadowBlur` (set higher up
 * in `Ye` from the destructured config). Reducing the divisor cuts
 * iteration count at moderate-to-high blur values, lowering the
 * shadow density to match the new Live/Tc behaviour set by
 * `patch-shadow-tune-and-tc-nonmeta-filter.cjs`.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  {
    label: "Edit Ye Meta iter divisor",
    oldStr: '_b+","+_a+"))"}();for(var _bp=0;_bp<Math.max(1,Math.ceil(q/10));_bp++){_S.eyebrowContentW',
    newStr: '_b+","+_a+"))"}();for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){_S.eyebrowContentW',
  },
  {
    label: "Edit Ye non-Meta iter divisor",
    oldStr: 'H.fillStyle=$;for(var _bp=0;_bp<Math.max(1,Math.ceil(q/10));_bp++){H.filter=_shFNM;',
    newStr: 'H.fillStyle=$;for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){H.filter=_shFNM;',
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  for (const r of REPLACEMENTS) {
    if (src.includes(r.newStr)) {
      console.log(`[patch-edit-shadow-iter-tune] ${r.label}: already applied`);
      continue;
    }
    const n = src.split(r.oldStr).length - 1;
    if (n === 0) {
      console.error(`[patch-edit-shadow-iter-tune] ${r.label}: anchor not found`);
      process.exit(1);
    }
    if (n !== 1) {
      console.error(`[patch-edit-shadow-iter-tune] ${r.label}: anchor not unique (${n})`);
      process.exit(1);
    }
    src = src.replace(r.oldStr, r.newStr);
    console.log(`[patch-edit-shadow-iter-tune] ${r.label}: 10→15`);
  }

  if (src === original) {
    console.log("[patch-edit-shadow-iter-tune] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-shadow-iter-tune] OK");
}
main();
