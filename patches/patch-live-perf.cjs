/*
 * patch-live-perf.cjs
 *
 * In-place performance patch for the shipped minified client bundle
 * `dist/public/assets/index-iitzneuS.js`.
 *
 * What this patch does:
 *
 * Removes the per-frame `getImageData(1920, 1080)` + BroadcastChannel
 * `postMessage({type:"frame", feed1:...})` block from the Live-page render
 * loop. This block was an ~8 MB GPU→CPU readback + structured-clone
 * broadcast on every tick, and nothing currently consumes it (Feed 1 /
 * Filter 1 pop-outs use the `captureStream(50)` MediaStream path exposed
 * on `window.opener`). At display refresh rates it was ~500 MB/s of pure
 * overhead and the single biggest source of render-loop jank.
 *
 * What this patch does NOT do (and why):
 *
 * An earlier version of this patch also inserted `gsap.ticker.fps(50)` +
 * `gsap.ticker.lagSmoothing(500, 33)` to lock the canvas paint rate to
 * match `captureStream(50)`. That was intended to eliminate 60→50 Hz
 * aliasing in the pop-out video. It did, but it caused the *reverse*
 * aliasing on the Live preview canvas when viewed on a 60 Hz / 120 Hz
 * monitor — each frame moves a fraction of a pixel at slow in/out speeds,
 * so the repeated display frames (60/50 = every 6th, or 120/50 = ~2.4
 * per frame) showed up as micro-stutter that's very visible on slow
 * animations. The canvas must be allowed to paint at the display's
 * native refresh rate; `captureStream(50)` sampling of the canvas is
 * handled by the browser independently and remains correct for broadcast.
 *
 * Idempotent: if the target sequence is already absent it's a no-op.
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

// Exact per-frame broadcast block inside the Kt render function, before the
// closing `};return Ks.ticker.add(Kt)` of the render useEffect.
const OLD_BROADCAST =
  'try{const En=Sa.current.getCurrentTimecode(),' +
  'rn=W.getImageData(0,0,1920,1080);' +
  'ie.postMessage({type:"frame",feed1:rn,timecode:En,timecodeString:xd.format(En),bgColor:st.current})' +
  '}catch{}';

// If an earlier version of this patch left ticker.fps / lagSmoothing calls
// in place, strip them so the canvas can paint at the display's native
// refresh rate again. (These are idempotently removed if present; no-op if
// absent.)
const OLD_TICKER_LOCK = 'Ks.ticker.fps(50),Ks.ticker.lagSmoothing(500,33),';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-live-perf] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  let src = fs.readFileSync(BUNDLE, "utf8");
  const original = src;
  let changed = false;

  // --- Remove per-frame broadcast --------------------------------------------
  const broadcastCount = src.split(OLD_BROADCAST).length - 1;
  if (broadcastCount > 1) {
    console.error(
      `[patch-live-perf] broadcast target found ${broadcastCount}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }
  if (broadcastCount === 1) {
    src = src.replace(OLD_BROADCAST, "");
    changed = true;
    console.log("[patch-live-perf]   removed per-frame getImageData + postMessage broadcast");
  }

  // --- Strip legacy ticker.fps(50) lock if present ---------------------------
  const lockCount = src.split(OLD_TICKER_LOCK).length - 1;
  if (lockCount > 1) {
    console.error(
      `[patch-live-perf] legacy ticker-lock snippet found ${lockCount}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }
  if (lockCount === 1) {
    src = src.replace(OLD_TICKER_LOCK, "");
    changed = true;
    console.log("[patch-live-perf]   removed legacy ticker.fps(50) / lagSmoothing lock");
  }

  if (!changed) {
    console.log("[patch-live-perf] bundle already patched — nothing to do.");
    return;
  }

  // Sanity: the render loop still schedules itself via gsap.ticker.add(Kt)
  if (!src.includes("Ks.ticker.add(Kt)")) {
    console.error(
      "[patch-live-perf] post-patch sanity check failed — Ks.ticker.add(Kt) not found.",
    );
    process.exit(1);
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(
    `[patch-live-perf] OK — bytes: ${original.length} -> ${src.length}  (delta ${src.length - original.length})`,
  );
}

main();
