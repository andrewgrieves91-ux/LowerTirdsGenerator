/*
 * patch-render-idle-skip.cjs
 *
 * In-place optimization for `dist/public/assets/index-iitzneuS.js`.
 *
 * Adds an idle short-circuit to the Live-page render function `Kt`.
 * Previously, when `animationStateRef.current === "idle"` (the app is
 * sitting between cues with no text on screen), the render loop still ran
 * the entire drawing pipeline: reading GSAP values, computing fonts and
 * positions, running `measureText` three times, drawing six `drawImage`
 * calls into color + alpha canvases, applying `ctx.filter` drop-shadow,
 * stroking underlines, and blending the motion-blur buffer — all with
 * `globalAlpha=0`, producing exactly zero visible output.
 *
 * The app spends the vast majority of wall time in the idle state between
 * cue plays, so turning that entire pipeline into a ~0.5 ms double
 * `fillRect` reclaims the bulk of the main-thread budget for when a cue
 * actually starts animating.
 *
 * Mechanism:
 *   - Condition changes from `if (!_e)` to `if (!_e || Ft.current === "idle")`
 *   - Body gets `{...;return}` so the function exits early
 *   - The existing `else { ... }` loses its `else` keyword, leaving a plain
 *     block statement that only runs when we didn't return — i.e. when a cue
 *     is actively playing. This preserves the original block's own variable
 *     scope and avoids risky structural rewrites.
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

const OLD =
  'Kt=()=>{const Ht=performance.now();lt++;const _e=x.current;if(!_e)' +
  'W.fillStyle=st.current,W.fillRect(0,0,1920,1080),' +
  'me.fillStyle="#000000",me.fillRect(0,0,1920,1080);else{';

const NEW =
  'Kt=()=>{const Ht=performance.now();lt++;const _e=x.current;' +
  'if(!_e||Ft.current==="idle"){' +
    'W.fillStyle=st.current,W.fillRect(0,0,1920,1080),' +
    'me.fillStyle="#000000",me.fillRect(0,0,1920,1080);' +
    'return' +
  '}{';

const APPLIED_MARKER = 'if(!_e||Ft.current==="idle"){W.fillStyle=st.current';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-render-idle-skip] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  const src = fs.readFileSync(BUNDLE, "utf8");

  if (src.includes(APPLIED_MARKER)) {
    console.log("[patch-render-idle-skip] already applied — nothing to do.");
    return;
  }

  const occurrences = src.split(OLD).length - 1;
  if (occurrences === 0) {
    console.error(
      "[patch-render-idle-skip] target sequence not found. Bundle may have",
      "changed — aborting without modification.",
    );
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error(
      `[patch-render-idle-skip] target found ${occurrences}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }

  const patched = src.replace(OLD, NEW);
  if (!patched.includes(APPLIED_MARKER)) {
    console.error("[patch-render-idle-skip] post-patch sanity check failed.");
    process.exit(1);
  }

  fs.writeFileSync(BUNDLE, patched, "utf8");
  const delta = patched.length - src.length;
  console.log(
    "[patch-render-idle-skip] OK — idle-state early-return inserted in render loop.",
  );
  console.log(
    `[patch-render-idle-skip]   bytes: ${src.length} -> ${patched.length}  (delta ${delta >= 0 ? "+" : "-"}${Math.abs(delta)})`,
  );
}

main();
