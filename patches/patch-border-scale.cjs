/*
 * patch-border-scale.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Fix: border width appears visibly thinner than the configured value.
 *
 * Cause: the K() offscreen factory renders text (and strokes the border)
 * at MAX scale (`_RS` = 1.121 for Meta, 1.0 for other animation types),
 * but the border `lineWidth` was set to the raw config value (`Oe`). The
 * render loop later paints the bitmap to the live canvas at a scale
 * factor of `currentScale / maxScale` — so for Meta at its base scale
 * (1.0), the bitmap gets drawn at 1/1.121 ≈ 0.892, and a 20 px border
 * stroked onto the bitmap shows up on screen as only ~17.8 px.
 *
 * The font sizes are already pre-multiplied by `_RS` precisely so that
 * after the display-time scale-down they render at the correct glyph
 * size. The border needs the same treatment.
 *
 * Changes:
 *   1. `Oe = V.config.borderWidth || 2`
 *        →  `Oe = (V.config.borderWidth || 2) * _RS`
 *      Stroke width scales with _RS so that after draw-time downscale
 *      the displayed border matches the configured value at the base
 *      animation state, and scales proportionally with text as Meta
 *      grows from 1.0× to 1.121×.
 *
 *   2. `_bw = V.config.borderEnabled ? V.config.borderWidth || 2 : 0`
 *        →  `_bw = V.config.borderEnabled ? (V.config.borderWidth || 2) * _RS : 0`
 *      `_bw` feeds the region-padding calculation around each line's
 *      text content (`os = ceil(_bw/2) + 2`, `jt = 4 + os`). Scaling
 *      `_bw` alongside `Oe` guarantees the region stays large enough
 *      for the wider stroke so the `drawImage` sub-rect copy never
 *      clips the border halo, even at maxed-out border widths.
 *
 * Side effects for non-Meta animations: `_RS === 1`, so both
 * multiplications are identity — slide / fade / etc. render borders
 * exactly as before.
 *
 * Export path (factory at byte ~644k, uses `i.borderWidth` with its own
 * `_RS`) is NOT touched by this patch — if it has the same latent bug
 * it can be addressed separately.
 *
 * Idempotent: re-running is a no-op.
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

const REPLACEMENTS = [
  {
    label: "region padding (_bw)",
    old: 'var _bw=V.config.borderEnabled?V.config.borderWidth||2:0;',
    new: 'var _bw=V.config.borderEnabled?(V.config.borderWidth||2)*_RS:0;',
  },
  {
    label: "border stroke width (Oe)",
    old: 'Oe=V.config.borderWidth||2;',
    new: 'Oe=(V.config.borderWidth||2)*_RS;',
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-border-scale] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  let src = fs.readFileSync(BUNDLE, "utf8");
  let changed = false;

  for (const { label, old, new: next } of REPLACEMENTS) {
    const hasNew = src.includes(next);
    const oldCount = src.split(old).length - 1;

    if (hasNew && oldCount === 0) {
      console.log(`[patch-border-scale] ${label}: already applied`);
      continue;
    }
    if (oldCount === 0) {
      console.error(
        `[patch-border-scale] ${label}: target not found. Bundle may have changed — aborting.`,
      );
      process.exit(1);
    }
    if (oldCount > 1) {
      console.error(
        `[patch-border-scale] ${label}: target found ${oldCount}x — refusing to patch ambiguously.`,
      );
      process.exit(1);
    }
    src = src.replace(old, next);
    changed = true;
    console.log(`[patch-border-scale] ${label}: multiplied by _RS`);
  }

  if (!changed) {
    console.log("[patch-border-scale] bundle already patched — nothing to do.");
    return;
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-border-scale] OK");
}

main();
