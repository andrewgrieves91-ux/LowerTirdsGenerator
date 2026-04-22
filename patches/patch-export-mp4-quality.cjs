/*
 * patch-export-mp4-quality.cjs  (Tier A3)
 *
 * Improves the MP4 (libx264) encoder settings used by the Export page:
 *
 *   `-preset ultrafast`   → `-preset medium`
 *   `-crf 18`             → `-crf 16`
 *   `-pix_fmt yuv420p`    → `-pix_fmt yuv422p`
 *
 * Rationale:
 *   - `ultrafast` disables most compression tools (no CABAC, no B-frames,
 *     no motion estimation refinement). It was likely chosen for minimal
 *     CPU, but ffmpeg-core is single-threaded WASM so encoding speed is
 *     dominated by raw WASM throughput anyway — `medium` gives 3–5x
 *     smaller files at the same CRF with negligible extra wall time on
 *     short cues.
 *   - `crf 18` → `crf 16` bumps quality a notch for broadcast-master use.
 *   - `yuv422p` avoids 4:2:0 chroma subsampling. 4:2:0 is visibly blurry
 *     on saturated red / blue / magenta text edges (common in lower
 *     thirds). 4:2:2 is standard broadcast chroma and is widely accepted
 *     by Premiere, Resolve, Final Cut, and all broadcast infrastructure.
 *
 * No UI changes — this is a pure codec-args swap inside the encoder
 * handler. Prores / qt-anim / avi args untouched.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OLD = '"-c:v","libx264","-preset","ultrafast","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart"';
const NEW = '"-c:v","libx264","-preset","medium","-crf","16","-pix_fmt","yuv422p","-movflags","+faststart"';
const MARKER = '"-preset","medium","-crf","16","-pix_fmt","yuv422p"';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-mp4-quality] already applied"); return; }
  const n = src.split(OLD).length - 1;
  if (n !== 1) { console.error(`[patch-export-mp4-quality] expected 1 target, found ${n}`); process.exit(1); }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-mp4-quality] OK — MP4 encoder upgraded to preset=medium crf=16 yuv422p");
}
main();
