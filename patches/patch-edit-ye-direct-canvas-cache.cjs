/*
 * patch-edit-ye-direct-canvas-cache.cjs
 *
 * Ye's direct (non-factory) path allocates a fresh shadow staging
 * canvas every frame via `document.createElement("canvas")`. Kt and
 * Tc both reuse a cached canvas via `__ltGetMtCanvas(...)`. Beyond
 * GC pressure, fresh canvases vs pooled ones can produce subtly
 * different pre-multiplied alpha edges in some browsers.
 *
 * Also: the shadow loop in this branch runs `for(_bp=0;_bp<ceil(q/15);_bp++)`
 * even when shadow is DISABLED (`z=false`). The filter is "none" then,
 * so nothing visibly bad happens, but each iteration still issues a
 * drawImage. Gates the loop on `z` to skip the work entirely.
 *
 * Idempotent + atomic.
 *
 * Note: after `patch-edit-ye-non-meta-factory`, Ye's direct path is
 * only reached when the factory output `Oe` is null (e.g. syncTest).
 * It's still worth caching the canvas for those cases.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Step A: replace the canvas allocation with __ltGetMtCanvas + ctx-state reset.
const ALLOC_OLD =
  'const _shTC=document.createElement("canvas");_shTC.width=H.canvas.width;_shTC.height=H.canvas.height;const _shTctx=_shTC.getContext("2d");_shTctx.textBaseline="top";_shTctx.lineJoin="round";_shTctx.lineCap="round";';
const ALLOC_NEW =
  'const _shTcE=globalThis.__ltGetMtCanvas("ye-direct",H.canvas.width,H.canvas.height);const _shTC=_shTcE.c;const _shTctx=_shTcE.x;';

// Step B: gate the shadow loop on `z`.
const LOOP_OLD =
  "for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){H.filter=_shFNM;H.globalAlpha=1;H.drawImage(_shTC,0,0)}";
const LOOP_NEW =
  "for(var _bp=0;_bp<(z?Math.max(1,Math.ceil(q/15)):0);_bp++){H.filter=_shFNM;H.globalAlpha=1;H.drawImage(_shTC,0,0)}";

const MARKER = '_shTcE=globalThis.__ltGetMtCanvas("ye-direct"';

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-edit-ye-direct-canvas-cache] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-ye-direct-canvas-cache] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-edit-ye-direct-canvas-cache] already applied");
    return;
  }
  src = applyOnce(src, ALLOC_OLD, ALLOC_NEW, "alloc");
  src = applyOnce(src, LOOP_OLD, LOOP_NEW, "loop-gate");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-ye-direct-canvas-cache] OK — Ye direct path now caches canvas + gates shadow loop on z");
}
main();
