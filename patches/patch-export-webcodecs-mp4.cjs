/*
 * patch-export-webcodecs-mp4.cjs  (Tier C2)
 *
 * Adds a WebCodecs-based MP4 export path that runs IN the browser/
 * Electron renderer using the native Chromium H.264 encoder. When this
 * path is active, MP4 export requires NEITHER ffmpeg-wasm NOR a system
 * ffmpeg binary.
 *
 * Preference order the Export handler now walks for video formats:
 *
 *   1. format === "mp4" AND window.ltgWebcodecsMp4.available() →
 *      WebCodecs path (this patch)
 *   2. window.ltElectron.ffmpeg.detect() returns a real binary →
 *      Native ffmpeg via IPC (patch-export-native-ffmpeg)
 *   3. Fallback → ffmpeg-wasm (unchanged)
 *
 * For ProRes / QT-RLE / AVI, step 1 is skipped (WebCodecs can't produce
 * these) so they go straight to native ffmpeg or wasm.
 *
 * The WebCodecs helper + mp4-muxer loader live in
 * dist/public/assets/ltg-webcodecs-mp4.js, loaded via a `<script>` tag
 * in index.html. It needs `window.VideoEncoder` and `window.caches` —
 * available in Electron (Chromium) and all modern browsers.
 *
 * Memory note: this path currently buffers all PNG frames in a JS
 * array before encoding (to slot into the existing vb() signature
 * cleanly), so peak RAM regresses to the pre-A2 level for MP4
 * specifically. Acceptable for typical cue durations. A follow-up
 * could refactor this to stream frames directly into VideoEncoder.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

// We inject BEFORE the native-ffmpeg branch from patch-export-native-ffmpeg.
const ANCHOR_OLD = 'Lt.src=ze});if(typeof window!=="undefined"&&window.ltElectron&&window.ltElectron.ffmpeg){';
const NEW =
'Lt.src=ze});' +
'if(i==="mp4"&&typeof window!=="undefined"&&window.ltgWebcodecsMp4&&window.ltgWebcodecsMp4.available()){' +
  'try{' +
    'const _Le2=u&&Qe.supportsAlpha;' +
    'const _wcFrames=[];' +
    'const _wcSink={count:0,async push(_buf){_wcFrames.push(_buf);this.count++}};' +
    'await vb(Ce,oe,le,we,_Le2,_Le2?"rgba(0,0,0,0)":_,Ie,He,(st,ze)=>{z(Ce.id,{progress:Math.round(st/ze*55)})},dt,_wcSink);' +
    'z(Ce.id,{status:"converting",progress:55});' +
    'const _wcBuf=await window.ltgWebcodecsMp4.encode(_wcFrames,{width:oe,height:le,fps:we},(i,n)=>{' +
      'z(Ce.id,{progress:55+Math.round(i/n*40)})' +
    '});' +
    'const _wcBt=new Blob([_wcBuf],{type:Qe.mimeType});' +
    'if(!await ve(_wcBt,zt,Qe.mimeType)){z(Ce.id,{status:"error",error:"Cancelled"});continue}' +
    'z(Ce.id,{status:"done",progress:100});' +
    'continue' +
  '}catch(_e){console.warn("[LTG] WebCodecs MP4 failed, falling back:",_e)}' +
'}' +
'if(typeof window!=="undefined"&&window.ltElectron&&window.ltElectron.ffmpeg){';

const MARKER = '[LTG] WebCodecs MP4 failed';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-webcodecs-mp4] already applied"); return; }
  const n = src.split(ANCHOR_OLD).length - 1;
  if (n !== 1) {
    console.error(`[patch-export-webcodecs-mp4] expected 1 anchor (the native-ffmpeg branch), found ${n}. Has patch-export-native-ffmpeg been applied first?`);
    process.exit(1);
  }
  fs.writeFileSync(BUNDLE, src.replace(ANCHOR_OLD, NEW), "utf8");
  console.log("[patch-export-webcodecs-mp4] OK — MP4 will prefer WebCodecs when available");
}
main();
