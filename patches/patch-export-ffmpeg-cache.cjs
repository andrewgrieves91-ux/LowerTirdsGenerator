/*
 * patch-export-ffmpeg-cache.cjs  (Tier A1)
 *
 * Caches the two ffmpeg-core assets (ffmpeg-core.js + ffmpeg-core.wasm,
 * ~37 MB total) in the browser's Cache Storage after the first download.
 * Subsequent sessions load them instantly with no network — making the
 * "offline" build actually work offline once the first successful export
 * has happened.
 *
 * Mechanism:
 *   - Check `caches.open('ffmpeg-core-v0.12.10')` for a hit on the CDN URL.
 *   - On hit: return a Blob URL constructed from the cached response body
 *     (skipping the progress-streaming loop since we already have the full
 *      payload). The progress bar jumps to the destination percentage with
 *     a "(cached)" suffix so the user knows it was instant.
 *   - On miss: do the existing streaming fetch + progress updates, then
 *     `cache.put(url, new Response(blob, {headers}))` after success.
 *   - The wrapper is entirely try/catch-safe: Cache Storage errors (e.g.
 *     cross-origin constraints in dev) do not break the download path.
 *
 * The cache key is `https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js`
 * and similarly for the .wasm — versioning is implicit in the URL, so
 * bumping the @ffmpeg/core version naturally invalidates.
 *
 * Idempotent.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OLD = 'a=async(c,u,f,m,p)=>{bc("loading",m,`Downloading ${f}…`);const v=await fetch(c);if(!v.ok)throw new Error(`Failed to fetch ${f}: ${v.status}`);const x=Number(v.headers.get("content-length")||0),b=v.body.getReader(),E=[];let _=0;for(;;){const{done:T,value:N}=await b.read();if(T)break;if(E.push(N),_+=N.length,x>0){const j=m+Math.round(_/x*(p-m));bc("loading",j,`Downloading ${f}… ${Math.round(_/x*100)}%`)}}const w=new Blob(E,{type:u});return URL.createObjectURL(w)}';

const NEW = 'a=async(c,u,f,m,p)=>{bc("loading",m,`Downloading ${f}…`);const _CN="ffmpeg-core-v0.12.10";try{if(typeof caches!=="undefined"){const _cx=await caches.open(_CN),_hit=await _cx.match(c);if(_hit){const _ab=await _hit.arrayBuffer();bc("loading",p,`${f} (cached)`);return URL.createObjectURL(new Blob([_ab],{type:u}))}}}catch(_){}const v=await fetch(c);if(!v.ok)throw new Error(`Failed to fetch ${f}: ${v.status}`);const x=Number(v.headers.get("content-length")||0),b=v.body.getReader(),E=[];let _=0;for(;;){const{done:T,value:N}=await b.read();if(T)break;if(E.push(N),_+=N.length,x>0){const j=m+Math.round(_/x*(p-m));bc("loading",j,`Downloading ${f}… ${Math.round(_/x*100)}%`)}}const w=new Blob(E,{type:u});try{if(typeof caches!=="undefined"){const _cx=await caches.open(_CN);await _cx.put(c,new Response(w.slice(),{headers:{"content-type":u,"content-length":String(w.size)}}))}}catch(_){}return URL.createObjectURL(w)}';

const MARKER = 'ffmpeg-core-v0.12.10';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) {
    console.log("[patch-export-ffmpeg-cache] already applied");
    return;
  }
  const n = src.split(OLD).length - 1;
  if (n !== 1) {
    console.error(`[patch-export-ffmpeg-cache] expected 1 target, found ${n} — aborting`);
    process.exit(1);
  }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-ffmpeg-cache] OK — ffmpeg-core will cache on first load");
}
main();
