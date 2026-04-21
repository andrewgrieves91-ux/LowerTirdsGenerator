/*
 * patch-countdown-throttle.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Throttles the two `setInterval` countdowns that drive the "remaining
 * time" label on the Live page from 100 ms (10 Hz) to 500 ms (2 Hz).
 *
 * Why this matters: each interval tick calls `B(...)` which is React's
 * `setRemainingTime`, forcing a full re-render of the ~2000-line Live
 * component. Over a short animation (e.g. 1 s in / 2 s dwell / 1 s out,
 * total 4 s) this fires 40 times — noisy but tolerable. Over a LONGER
 * animation (e.g. 5 s in / 3 s dwell / 5 s out, total 13 s) it fires 130
 * times. Each re-render steals main-thread time from the GSAP ticker and
 * the canvas render loop, producing visible micro-stutters every 100 ms,
 * and in extreme cases a single long re-render can make the animation
 * appear to "pause" or "not finish" at its intended endpoint because
 * enough frames got dropped that the perceived motion falls behind the
 * audible/visual expectation.
 *
 * The on-screen countdown displays one decimal of seconds
 * (`(remaining/1000).toFixed(1)`), so at 500 ms tick rate you still see
 * it count 5.5 → 5.0 → 4.5 → 4.0 → … — responsive and readable, without
 * the re-render storm.
 *
 * The two intervals target the same Live component:
 *   - the "interrupt during play → animate-out" code path
 *   - the "normal play-to-completion" code path
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

// Full signatures so we only match the Live countdown intervals — there are
// other `,100)` occurrences in the bundle (unrelated setTimeouts/animation
// frame budgets) that must not be touched.
const REPLACEMENTS = [
  {
    label: "interrupt → animate-out countdown",
    old: 'setInterval(()=>{const Kt=performance.now()-lt,Ht=Math.max(0,Ge-Kt);B(Ht),Ht<=0&&(clearInterval(ht.current),ht.current=null)},100)',
    new: 'setInterval(()=>{const Kt=performance.now()-lt,Ht=Math.max(0,Ge-Kt);B(Ht),Ht<=0&&(clearInterval(ht.current),ht.current=null)},500)',
  },
  {
    label: "normal play-to-completion countdown",
    old: 'setInterval(()=>{const Ge=performance.now()-We,Ke=Math.max(0,me-Ge);B(Ke),Ke<=0&&(clearInterval(ht.current),ht.current=null)},100)',
    new: 'setInterval(()=>{const Ge=performance.now()-We,Ke=Math.max(0,me-Ge);B(Ke),Ke<=0&&(clearInterval(ht.current),ht.current=null)},500)',
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-countdown-throttle] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  let src = fs.readFileSync(BUNDLE, "utf8");
  let changed = false;

  for (const { label, old, new: next } of REPLACEMENTS) {
    const oldCount = src.split(old).length - 1;
    const newCount = src.split(next).length - 1;

    if (oldCount === 0 && newCount >= 1) {
      console.log(`[patch-countdown-throttle] ${label}: already applied`);
      continue;
    }
    if (oldCount === 0) {
      console.error(
        `[patch-countdown-throttle] ${label}: target not found. Bundle may have changed — aborting.`,
      );
      process.exit(1);
    }
    if (oldCount > 1) {
      console.error(
        `[patch-countdown-throttle] ${label}: target found ${oldCount}x — refusing to patch ambiguously.`,
      );
      process.exit(1);
    }
    src = src.replace(old, next);
    changed = true;
    console.log(`[patch-countdown-throttle] ${label}: throttled 100 ms → 500 ms`);
  }

  if (!changed) {
    console.log("[patch-countdown-throttle] bundle already patched — nothing to do.");
    return;
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-countdown-throttle] OK");
}

main();
