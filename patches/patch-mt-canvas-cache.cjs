/*
 * patch-mt-canvas-cache.cjs
 *
 * Caches the unified-shadow temp canvas across frames in Live Kt
 * (60Hz), Edit Ye, and Tc Meta. Without this, every frame allocates
 * a fresh 1920x1080 canvas + 2D context, which on macOS is ~3-5ms of
 * GPU/CPU overhead per frame and the primary cause of the dev-server
 * "Play Cue" lag.
 *
 * Strategy:
 *   1. Inject a global helper `__ltGetMtCanvas(key, w, h)` that returns
 *      a pre-allocated canvas+context, clearing it before return.
 *   2. Rewrite each of the 3 per-frame allocation sites to call the
 *      helper instead of `document.createElement("canvas")`.
 *
 * Helper is injected once near the bundle's top (idempotency-marked).
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const HELPER_MARKER = "__ltGetMtCanvas=";
const HELPER_CODE =
  // window-scoped cache to survive HMR/page navigations
  "globalThis.__ltGetMtCanvas=globalThis.__ltGetMtCanvas||function(){" +
    "var _cache={};" +
    "return function(key,w,h){" +
      "var e=_cache[key];" +
      "if(!e||e.c.width!==w||e.c.height!==h){" +
        "var c=document.createElement('canvas');c.width=w;c.height=h;" +
        "var x=c.getContext('2d');x.textBaseline='top';x.lineJoin='round';x.lineCap='round';" +
        "e=_cache[key]={c:c,x:x};" +
      "}" +
      "e.x.clearRect(0,0,w,h);" +
      "e.x.globalAlpha=1;e.x.filter='none';e.x.globalCompositeOperation='source-over';" +
      "return e;" +
    "};" +
  "}();";

// Live Kt site
const KT_OLD =
  'const _mtLkTC=document.createElement("canvas");_mtLkTC.width=W.canvas.width;_mtLkTC.height=W.canvas.height;const _mtLkCtx=_mtLkTC.getContext("2d");_mtLkCtx.textBaseline="top";_mtLkCtx.lineJoin="round";_mtLkCtx.lineCap="round";';
const KT_NEW =
  'const _mtLkE=globalThis.__ltGetMtCanvas("kt",W.canvas.width,W.canvas.height);const _mtLkTC=_mtLkE.c;const _mtLkCtx=_mtLkE.x;';

// Tc Meta (Export) site
const TC_OLD =
  'const _mtTC=document.createElement("canvas");_mtTC.width=n.canvas.width;_mtTC.height=n.canvas.height;const _mtCtx=_mtTC.getContext("2d");_mtCtx.textBaseline="top";_mtCtx.lineJoin="round";_mtCtx.lineCap="round";';
const TC_NEW =
  'const _mtE=globalThis.__ltGetMtCanvas("tc",n.canvas.width,n.canvas.height);const _mtTC=_mtE.c;const _mtCtx=_mtE.x;';

// Edit Ye Meta site
const YE_OLD =
  'const _mtEyTC=document.createElement("canvas");_mtEyTC.width=H.canvas.width;_mtEyTC.height=H.canvas.height;const _mtEyCtx=_mtEyTC.getContext("2d");_mtEyCtx.textBaseline="top";_mtEyCtx.lineJoin="round";_mtEyCtx.lineCap="round";';
const YE_NEW =
  'const _mtEyE=globalThis.__ltGetMtCanvas("ye",H.canvas.width,H.canvas.height);const _mtEyTC=_mtEyE.c;const _mtEyCtx=_mtEyE.x;';

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-mt-canvas-cache] ${label} anchor not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-mt-canvas-cache] ${label} anchor not unique (${n})`);
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

  if (src.includes(HELPER_MARKER)) {
    console.log("[patch-mt-canvas-cache] already applied");
    return;
  }

  // 1. Inject the helper at the very top of the bundle (after a leading
  //    "use strict" or comment if present, otherwise at byte 0).
  src = HELPER_CODE + src;

  // 2. Patch each of the 3 sites to use the helper.
  src = applyOnce(src, KT_OLD, KT_NEW, "Live Kt");
  src = applyOnce(src, TC_OLD, TC_NEW, "Tc Meta");
  src = applyOnce(src, YE_OLD, YE_NEW, "Edit Ye Meta");

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-mt-canvas-cache] OK — temp canvases now cached across frames");
}
main();
