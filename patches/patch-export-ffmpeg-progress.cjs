/*
 * patch-export-ffmpeg-progress.cjs  (Tier B3)
 *
 * Before: the export progress bar jumped 55% → 100% during the ffmpeg
 * encode step, with no feedback to the user while ffmpeg was running.
 * On long cues this looks frozen.
 *
 * After: hooks `ai.on('progress', …)` — the FFmpeg-wasm event emitted
 * with `{progress: 0..1, time: usec}` — to the cue's progress status,
 * mapped into the range 55–90% (leaving 90–100 for readFile + save +
 * byte-patch for ProRes/QT-RLE outputs).
 *
 * The listener is rebound per cue so it references the current cue id
 * and progress setter `z`, and any previous listener is `off()`ed first
 * so we don't accumulate handlers across cues in the same session.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OLD = 'await Pt.exec(at);';
const NEW = 'if(Pt._ltgCurProgressCb){try{Pt.off("progress",Pt._ltgCurProgressCb)}catch(_){}}Pt._ltgCurProgressCb=({progress:_pg})=>{if(typeof _pg==="number"&&_pg>=0&&_pg<=1){try{z(Ce.id,{progress:55+Math.round(_pg*35)})}catch(_){}}};try{Pt.on("progress",Pt._ltgCurProgressCb)}catch(_){}await Pt.exec(at);';
const MARKER = '_ltgCurProgressCb';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-ffmpeg-progress] already applied"); return; }
  const n = src.split(OLD).length - 1;
  if (n !== 1) { console.error(`[patch-export-ffmpeg-progress] expected 1 target, found ${n}`); process.exit(1); }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-ffmpeg-progress] OK — ffmpeg progress mapped to 55–90% range");
}
main();
