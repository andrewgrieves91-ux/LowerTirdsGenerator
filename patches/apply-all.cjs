/*
 * apply-all.cjs
 *
 * Runs every performance patch in this directory in a well-defined order.
 * Each patch is idempotent, so re-running this script after a `git checkout`
 * of the bundle will re-apply the full stack cleanly.
 *
 * Usage:
 *   node patches/apply-all.cjs
 */

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PATCHES = [
  "patch-live-perf.cjs",
  "patch-render-idle-skip.cjs",
  "patch-render-shadow-dedup.cjs",
  "patch-countdown-throttle.cjs",
  "patch-underline-scale.cjs",
  "patch-underline-logo-offset.cjs",
  "patch-shadow-zero-blur-and-underline.cjs",
  "patch-border-scale.cjs",
  "patch-border-scale-edit-export.cjs",
  "patch-shadow-zero-blur-edit-export.cjs",
  "patch-meta-underline-shadow-scale-edit-export.cjs",
  "patch-underline-logo-offset-correct.cjs",
  // Export pipeline (tiers A1-B3)
  "patch-export-ffmpeg-cache.cjs",
  "patch-export-stream-frames.cjs",
  "patch-export-mp4-quality.cjs",
  "patch-export-framerate-config.cjs",
  "patch-export-single-png-seek.cjs",
  "patch-export-ffmpeg-progress.cjs",
  // Tier C1 + C2 — order matters: native-ffmpeg must land before
  // webcodecs-mp4 because the latter's anchor is the former's code.
  "patch-export-native-ffmpeg.cjs",
  "patch-export-webcodecs-mp4.cjs",
  "patch-export-inject-webcodecs-script.cjs",
  // MOV alpha Premiere 2026 compatibility (ordered: args change first so
  // the byte-patching removal can rely on correct muxer output).
  "patch-export-mov-alpha-args.cjs",
  "patch-export-remove-depth-hack.cjs",
  // Restores the vendor swap (FFMP -> appl) that remove-depth-hack
  // incorrectly deleted. The depth flip stays gone; only the vendor
  // swap is brought back. Premiere 2026 needs the container vendor
  // field patched.
  "patch-export-restore-vendor-swap.cjs",
];

let ok = true;
for (const name of PATCHES) {
  const full = path.resolve(__dirname, name);
  console.log(`\n==> ${name}`);
  const res = spawnSync(process.execPath, [full], { stdio: "inherit" });
  if (res.status !== 0) {
    ok = false;
    console.error(`[apply-all] ${name} failed with exit ${res.status}`);
    break;
  }
}

if (!ok) {
  process.exit(1);
}
console.log("\n[apply-all] all patches applied successfully.");
