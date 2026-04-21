/*
 * patch-shadow-zero-blur-and-underline.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Fixes two related shadow issues in the Live render loop:
 *
 *   1. SHADOW DISAPPEARS AT 0% BLUR.
 *      The text-shadow pass runs `N = Math.ceil(shadowBlur / 10)`
 *      iterations of `drawImage(bitmap, ..., { filter: drop-shadow })` to
 *      accumulate shadow opacity. When the operator sets `shadowBlur = 0`
 *      (hard-edged offset shadow), N becomes 0 and the loop body never
 *      executes — no shadow is drawn at all. We clamp the iteration
 *      count to at least 1 when `shadowEnabled`, so a 0-blur shadow still
 *      renders as a crisp offset shadow rather than vanishing.
 *
 *   2. UNDERLINE HAS NO SHADOW.
 *      The underline is stroked live each frame on the color canvas,
 *      intentionally *after* the shadow pass so it sits above the shadow
 *      cloud visually. That meant it never received a shadow of its own,
 *      while the text above and below it did — a visual inconsistency.
 *      We now set `ctx.shadowBlur / shadowOffsetX / shadowOffsetY /
 *      shadowColor` on the color-canvas context before each stroke group
 *      in the underline block, using the same shadow config the text
 *      uses. The alpha matte strokes (on `me`) stay shadow-less because
 *      the matte output must remain a hard luma key with no halo.
 *
 *      Shadow color alpha is capped at `min(shadowStrength/100, 1)` so
 *      at 100% strength (default) it matches the text's accumulated
 *      drop-shadow alpha exactly. At lower strengths the single-pass
 *      underline shadow will be slightly darker than the N-pass text
 *      shadow — acceptable trade-off for simplicity vs. running another
 *      iteration loop just for underlines.
 *
 *      At the very end of the underline block we reset
 *      `W.shadowBlur/OffsetX/OffsetY` to zero so the shadow state does
 *      not leak into the next frame's `fillRect` / `drawImage` calls.
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

// ---------------------------------------------------------------------------
// 1. Shadow loop iteration count: ensure >= 1 when shadowEnabled
// ---------------------------------------------------------------------------
const LOOP_OLD =
  '_e.config.shadowEnabled?Math.ceil((_e.config.shadowBlur??10)/10):0';
const LOOP_NEW =
  '_e.config.shadowEnabled?Math.max(1,Math.ceil((_e.config.shadowBlur??10)/10)):0';

// ---------------------------------------------------------------------------
// 2. Replace `W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,` (two
//    identical occurrences, both inside the underline block) with a
//    conditional shadow setup IIFE. When shadow is enabled, we apply the
//    config values + computed rgba() color; otherwise we zero everything
//    (identical to the old behaviour).
// ---------------------------------------------------------------------------
const SHADOW_ZERO = 'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,';
const SHADOW_APPLY =
  '(function(){' +
    'if(_e.config.shadowEnabled){' +
      'var _c=_e.config.shadowColor??"#000000";' +
      'W.shadowBlur=_e.config.shadowBlur??10;' +
      'W.shadowOffsetX=_e.config.shadowOffsetX??0;' +
      'W.shadowOffsetY=_e.config.shadowOffsetY??0;' +
      'W.shadowColor="rgba("+' +
        '(parseInt(_c.slice(1,3),16)||0)+","+' +
        '(parseInt(_c.slice(3,5),16)||0)+","+' +
        '(parseInt(_c.slice(5,7),16)||0)+","+' +
        'Math.min((_e.config.shadowStrength??100)/100,1)+")"' +
    '}else{' +
      'W.shadowBlur=0;W.shadowOffsetX=0;W.shadowOffsetY=0' +
    '}' +
  '})(),';

// ---------------------------------------------------------------------------
// 3. Append a shadow-state reset at the very end of the underline block so
//    the canvas state doesn't leak into the next frame's fillRect/drawImage.
// ---------------------------------------------------------------------------
const END_OLD =
  'me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke()}';
const END_NEW =
  'me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke();' +
  'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0' +
  '}';

// Idempotency markers
const APPLIED_LOOP_MARK = 'Math.max(1,Math.ceil((_e.config.shadowBlur??10)/10)):0';
const APPLIED_APPLY_MARK = 'W.shadowColor="rgba("+(parseInt(_c.slice(1,3),16)';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-shadow-zero-blur-and-underline] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  let src = fs.readFileSync(BUNDLE, "utf8");
  let changed = false;

  // --- (1) loop iteration count ---------------------------------------------
  if (src.includes(APPLIED_LOOP_MARK)) {
    console.log("[patch-shadow-zero-blur-and-underline] loop clamp already applied");
  } else {
    const n = src.split(LOOP_OLD).length - 1;
    if (n === 0) {
      console.error(
        "[patch-shadow-zero-blur-and-underline] shadow-loop target not found — aborting",
      );
      process.exit(1);
    }
    if (n > 1) {
      console.error(
        `[patch-shadow-zero-blur-and-underline] shadow-loop target found ${n}x — ambiguous, aborting`,
      );
      process.exit(1);
    }
    src = src.replace(LOOP_OLD, LOOP_NEW);
    changed = true;
    console.log("[patch-shadow-zero-blur-and-underline] loop clamp (>=1 iter) applied");
  }

  // --- (2) underline shadow setup (replace both occurrences) ----------------
  if (src.includes(APPLIED_APPLY_MARK)) {
    console.log("[patch-shadow-zero-blur-and-underline] underline shadow setup already applied");
  } else {
    const n = src.split(SHADOW_ZERO).length - 1;
    if (n !== 2) {
      console.error(
        `[patch-shadow-zero-blur-and-underline] expected exactly 2 occurrences of the zero-shadow prefix in the underline block, found ${n} — aborting`,
      );
      process.exit(1);
    }
    src = src.split(SHADOW_ZERO).join(SHADOW_APPLY);
    changed = true;
    console.log("[patch-shadow-zero-blur-and-underline] underline shadow setup applied (2 sites)");
  }

  // --- (3) end-of-block shadow reset ---------------------------------------
  if (src.includes(END_NEW)) {
    console.log("[patch-shadow-zero-blur-and-underline] end-of-block reset already applied");
  } else {
    const n = src.split(END_OLD).length - 1;
    if (n === 0) {
      console.error(
        "[patch-shadow-zero-blur-and-underline] end-of-block anchor not found — aborting",
      );
      process.exit(1);
    }
    if (n > 1) {
      console.error(
        `[patch-shadow-zero-blur-and-underline] end-of-block anchor found ${n}x — ambiguous, aborting`,
      );
      process.exit(1);
    }
    src = src.replace(END_OLD, END_NEW);
    changed = true;
    console.log("[patch-shadow-zero-blur-and-underline] end-of-block shadow reset applied");
  }

  if (!changed) {
    console.log("[patch-shadow-zero-blur-and-underline] bundle already patched — nothing to do.");
    return;
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-shadow-zero-blur-and-underline] OK");
}

main();
