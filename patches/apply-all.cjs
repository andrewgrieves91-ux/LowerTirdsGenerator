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
