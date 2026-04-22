/*
 * patch-export-stream-frames.cjs  (Tier A2)
 *
 * Halves peak RAM usage during video exports by writing PNG frames
 * directly to ffmpeg's MEMFS as they are rendered, instead of buffering
 * every frame in a JS array first and then copying them across.
 *
 * Before:
 *   vb() → builds T[] array of Uint8Array PNG buffers
 *   handler → gb() to load ffmpeg
 *           → writeFile loop copies each T[i] into MEMFS
 *           → MEMFS now holds all frames; T still holds all frames
 *           → exec()  (peak memory = 2 × frame bytes)
 *
 * After:
 *   handler → gb() loaded FIRST
 *           → vb(..., sink) where sink.push(bytes) = ffmpeg.writeFile(...)
 *           → vb emits each frame, written straight to MEMFS, JS copy
 *             goes out of scope immediately
 *           → MEMFS holds all frames; no JS array
 *           → exec()  (peak memory = 1 × frame bytes, plus 1 in-flight)
 *
 * The png-seq path still uses the original non-streaming vb() behaviour
 * (no ffmpeg involved) — unchanged, since it genuinely needs the full
 * frame array to zip them.
 *
 * Implementation:
 *   1. vb() takes a new optional 11th parameter `_sink`. When provided,
 *      each frame goes `await _sink.push(bytes)` instead of `T.push`.
 *      The returned `T` stays empty — callers that don't use the sink
 *      still get their array as before.
 *   2. The encoder handler loads ffmpeg first, constructs a sink that
 *      writes to MEMFS, calls vb() streaming, then proceeds directly to
 *      exec without the intermediate writeFile loop. Frame count is
 *      tracked on the sink for the final deleteFile loop.
 *
 * Idempotent.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OPS = [
  {
    label: "vb() signature — add optional _sink param",
    old: 'async function vb(r,n,a,l,i,c,u,f,m,p=null){',
    new: 'async function vb(r,n,a,l,i,c,u,f,m,p=null,_sink=null){',
    marker: 'async function vb(r,n,a,l,i,c,u,f,m,p=null,_sink=null){',
  },
  {
    label: "vb() body — route frame to sink when provided",
    old: 'T.push(k),m(C+1,w),C%10===9&&await new Promise(M=>setTimeout(M,0))',
    new: '(_sink?await _sink.push(k):T.push(k)),m(C+1,w),C%10===9&&await new Promise(M=>setTimeout(M,0))',
    marker: '_sink?await _sink.push(k):T.push(k)',
  },
  {
    label: "handler — pre-load ffmpeg + streaming sink (replaces write-loop)",
    old: 'Ae=await vb(Ce,oe,le,we,Le,Le?"rgba(0,0,0,0)":_,Ie,He,(st,ze)=>{z(Ce.id,{progress:Math.round(st/ze*55)})},dt);z(Ce.id,{status:"converting",progress:55});const Pt=await gb((st,ze)=>{C(st),D(ze)}),xt=`fr_${Ce.id}`;for(let st=0;st<Ae.length;st++)await Pt.writeFile(`${xt}_${String(st).padStart(6,"0")}.png`,Ae[st]);',
    new: 'Pt=await gb((st,ze)=>{C(st),D(ze)}),xt=`fr_${Ce.id}`,_Asink={count:0,async push(_buf){await Pt.writeFile(`${xt}_${String(this.count).padStart(6,"0")}.png`,_buf);this.count++}},Ae=await vb(Ce,oe,le,we,Le,Le?"rgba(0,0,0,0)":_,Ie,He,(st,ze)=>{z(Ce.id,{progress:Math.round(st/ze*55)})},dt,_Asink);z(Ce.id,{status:"converting",progress:55});',
    marker: '_Asink={count:0,async push(_buf)',
  },
  {
    label: "handler — delete-loop uses sink count instead of Ae.length",
    old: 'for(let st=0;st<Ae.length;st++)await Pt.deleteFile(`${xt}_${String(st).padStart(6,"0")}.png`);',
    new: 'for(let st=0;st<_Asink.count;st++)await Pt.deleteFile(`${xt}_${String(st).padStart(6,"0")}.png`);',
    marker: 'for(let st=0;st<_Asink.count;st++)await Pt.deleteFile',
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  const results = [];
  for (const op of OPS) {
    if (src.includes(op.marker)) {
      results.push({ op, status: "already" });
      continue;
    }
    const n = src.split(op.old).length - 1;
    if (n !== 1) {
      console.error(`[patch-export-stream-frames] ${op.label}: expected 1 target, found ${n} — aborting`);
      process.exit(1);
    }
    src = src.replace(op.old, op.new);
    results.push({ op, status: "apply" });
  }
  if (src === original) { console.log("[patch-export-stream-frames] bundle already patched — nothing to do."); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  for (const { op, status } of results) console.log(`[patch-export-stream-frames] ${op.label}: ${status}`);
  console.log("[patch-export-stream-frames] OK");
}
main();
