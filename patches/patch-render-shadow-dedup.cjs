/*
 * patch-render-shadow-dedup.cjs
 *
 * In-place optimization for `dist/public/assets/index-iitzneuS.js`.
 *
 * Removes a duplicate-draw in the Meta-animation shadow path.
 *
 * Before:
 *   for (var _bpL = 0;
 *        _bpL < (shadowEnabled ? ceil(shadowBlur/10) : 1);
 *                                                     ^^^  <-- runs 1 iter
 *        _bpL++) {
 *      drawImage(colorCanvas, …);  // filter="none" when shadow off
 *   }
 *   // Then immediately after the loop:
 *   drawImage(H.colorCanvas, …);   // crisp text pass
 *
 * When shadow is disabled the loop runs ONCE and re-draws the same color
 * text that the post-loop block already draws — three `drawImage` calls per
 * frame that produce identical pixels. Changing the `:1` fallback to `:0`
 * makes the shadow loop skip entirely when shadow is off, letting the
 * crisp-text post-loop block do its job alone.
 *
 * When shadow IS enabled (blur > 0) the loop count is unchanged — it still
 * iterates `ceil(shadowBlur/10)` times to build up the drop-shadow filter
 * accumulation, followed by the crisp-text pass on top. Identical visual
 * output.
 *
 * Idempotent: re-running is a no-op if the patch is already in place.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BUNDLE = path.resolve(
  __dirname,
  "..",
  "dist",
  "public",
  "assets",
  "index-iitzneuS.js",
);

const OLD = "_e.config.shadowEnabled?Math.ceil((_e.config.shadowBlur??10)/10):1";
const NEW = "_e.config.shadowEnabled?Math.ceil((_e.config.shadowBlur??10)/10):0";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-render-shadow-dedup] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  const src = fs.readFileSync(BUNDLE, "utf8");

  const oldOccurrences = src.split(OLD).length - 1;
  const newOccurrences = src.split(NEW).length - 1;

  if (oldOccurrences === 0 && newOccurrences >= 1) {
    console.log("[patch-render-shadow-dedup] already applied — nothing to do.");
    return;
  }
  if (oldOccurrences === 0) {
    console.error(
      "[patch-render-shadow-dedup] target sequence not found. Bundle may have",
      "changed — aborting without modification.",
    );
    process.exit(1);
  }
  if (oldOccurrences > 1) {
    console.error(
      `[patch-render-shadow-dedup] target found ${oldOccurrences}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }

  const patched = src.replace(OLD, NEW);

  fs.writeFileSync(BUNDLE, patched, "utf8");
  console.log(
    "[patch-render-shadow-dedup] OK — skipped redundant shadow-off loop iteration.",
  );
  console.log(
    `[patch-render-shadow-dedup]   bytes: ${src.length} -> ${patched.length}  (delta 0)`,
  );
}

main();
