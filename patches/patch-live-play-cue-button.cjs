/*
 * patch-live-play-cue-button.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Two cosmetic fixes for the Live page's Play Cue button:
 *
 * (A) Remove the dev-time " [v2]" suffix on the button label
 *     Before: "Play Cue [v2]"  →  After: "Play Cue"
 *
 * (B) Make the countdown smooth.
 *     The button shows `(D/1e3).toFixed(1) + "s"` while a cue is
 *     animating in / dwelling / animating out. The countdown state D
 *     is updated by `setInterval(..., 500)` which means the displayed
 *     value can only ever change every 500 ms — visibly chunky for a
 *     0.1 s formatted value. Switch the two relevant intervals to 50 ms
 *     so the countdown ticks ten times per second.
 *
 *     We deliberately leave the OTHER `,500)` setInterval alone — that
 *     one polls pop-out window state (dt/Je/$e) and absolutely doesn't
 *     need to fire 10× more often.
 *
 * Idempotent. Atomic — bails on any second-run inconsistency.
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

// (A) Button label
const LABEL_OLD = '"Play Cue [v2]"';
const LABEL_NEW = '"Play Cue"';

// (B) Countdown intervals — these are the two bodies that update the
// countdown state `B(Ht)` / `B(Ke)`. The third 500 ms interval in the
// file uses different setter names (dt/Je/$e) and is left alone.
const INT_OLD_1 = 'ht.current=window.setInterval(()=>{const Kt=performance.now()-lt,Ht=Math.max(0,Ge-Kt);B(Ht),Ht<=0&&(clearInterval(ht.current),ht.current=null)},500)';
const INT_NEW_1 = 'ht.current=window.setInterval(()=>{const Kt=performance.now()-lt,Ht=Math.max(0,Ge-Kt);B(Ht),Ht<=0&&(clearInterval(ht.current),ht.current=null)},50)';

const INT_OLD_2 = 'ht.current=window.setInterval(()=>{const Ge=performance.now()-We,Ke=Math.max(0,me-Ge);B(Ke),Ke<=0&&(clearInterval(ht.current),ht.current=null)},500)';
const INT_NEW_2 = 'ht.current=window.setInterval(()=>{const Ge=performance.now()-We,Ke=Math.max(0,me-Ge);B(Ke),Ke<=0&&(clearInterval(ht.current),ht.current=null)},50)';

const APPLIED_MARKER = '"Play Cue"]})'; // post-patch button JSX (label without [v2])

function applyExact(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-live-play-cue-button] ${label}: anchor not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-live-play-cue-button] ${label}: expected 1 anchor, found ${n}`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  // Idempotency: if "Play Cue [v2]" is already gone AND both intervals are 50,
  // do nothing.
  if (
    !src.includes(LABEL_OLD) &&
    !src.includes(INT_OLD_1) &&
    !src.includes(INT_OLD_2)
  ) {
    console.log("[patch-live-play-cue-button] already applied — nothing to do");
    return;
  }

  // (A) label
  if (src.includes(LABEL_OLD)) {
    src = applyExact(src, LABEL_OLD, LABEL_NEW, "(A) button label");
  }

  // (B) intervals
  if (src.includes(INT_OLD_1)) {
    src = applyExact(src, INT_OLD_1, INT_NEW_1, "(B1) countdown interval (animateOut)");
  }
  if (src.includes(INT_OLD_2)) {
    src = applyExact(src, INT_OLD_2, INT_NEW_2, "(B2) countdown interval (play)");
  }

  if (!src.includes(APPLIED_MARKER)) {
    console.error("[patch-live-play-cue-button] post-patch sanity check failed");
    process.exit(1);
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(
    `[patch-live-play-cue-button] OK — label cleaned, countdown intervals 500 -> 50 ms`,
  );
  console.log(
    `[patch-live-play-cue-button]   bytes: ${original.length} -> ${src.length}  (delta ${src.length - original.length >= 0 ? "+" : "-"}${Math.abs(src.length - original.length)})`,
  );
}

main();
