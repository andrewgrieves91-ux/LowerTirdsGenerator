/*
 * patch-export-native-ffmpeg.cjs  (Tier C1)
 *
 * When running inside Electron AND a native `ffmpeg` binary is detected
 * on the machine, the Export page's video encoders now prefer native
 * ffmpeg over ffmpeg-wasm.
 *
 * Benefits:
 *   - 10-50x faster encoding (native multi-threaded vs single-threaded WASM)
 *   - No 37 MB CDN download (truly offline, first export and every export)
 *   - ProRes / QT-RLE output is correctly tagged by the real ffmpeg —
 *     no need for the byte-level header patching the WASM path uses
 *   - Access to hardware-accelerated encoders on macOS if you edit the
 *     args to use e.g. `h264_videotoolbox`
 *
 * Detection: checks `window.ltElectron.ffmpeg.detect()` which is exposed
 * by the Electron preload (electron/preload.cjs) and backed by
 * electron/ffmpegNative.cjs. Native ffmpeg is discovered via these paths
 * in order:
 *     /opt/homebrew/bin/ffmpeg   (Apple Silicon Homebrew)
 *     /usr/local/bin/ffmpeg      (Intel Homebrew / Linux)
 *     /usr/bin/ffmpeg            (Linux distro packages)
 *     C:\Program Files\ffmpeg\bin\ffmpeg.exe
 *     (anything on $PATH via `which` / `where`)
 *
 * Graceful fallback: if no binary is found OR the native invocation
 * errors, the code logs a warning and proceeds to the existing
 * ffmpeg-wasm path (which has all the prior fixes: streaming frames,
 * improved MP4 settings, progress callback, cache, etc.).
 *
 * Flow for the native path:
 *   1. Create a per-cue temp session on the main process side
 *   2. As vb() emits each PNG frame, write it directly to the session
 *      tempdir via IPC (one writeFile per frame, streaming)
 *   3. Assemble ffmpeg CLI args (same format logic as WASM path)
 *   4. Subscribe to per-second progress events over IPC
 *   5. Invoke ffmpeg, get the output buffer back over IPC
 *   6. Save to user's chosen path via the existing `ve()` save helper
 *   7. Tell main process to clean up the temp dir
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

// Split point: end of the `const dt = await new Promise(...)` declaration,
// right before `,Le=u&&Qe.supportsAlpha,`. We convert that comma into a
// statement terminator, inject the native try-branch, then start a fresh
// const chain for the ffmpeg-wasm fallback path.
const OLD = 'Lt.src=ze}),Le=u&&Qe.supportsAlpha,Pt=await gb';
const NATIVE_BRANCH =
'Lt.src=ze});' +
'if(typeof window!=="undefined"&&window.ltElectron&&window.ltElectron.ffmpeg){' +
  'try{' +
    'if(await window.ltElectron.ffmpeg.detect()){' +
      'const _sid="ltg-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);' +
      'const _ir=await window.ltElectron.ffmpeg.init(_sid);' +
      'if(_ir&&_ir.ok){' +
        'const _Le=u&&Qe.supportsAlpha,' +
              '_nSink={count:0,async push(_buf){' +
                'const _r=await window.ltElectron.ffmpeg.writeFrame(_sid,this.count,_buf);' +
                'if(!_r||!_r.ok)throw new Error(_r&&_r.error?_r.error:"writeFrame failed");' +
                'this.count++' +
              '}};' +
        'await vb(Ce,oe,le,we,_Le,_Le?"rgba(0,0,0,0)":_,Ie,He,(st,ze)=>{z(Ce.id,{progress:Math.round(st/ze*55)})},dt,_nSink);' +
        'z(Ce.id,{status:"converting",progress:55});' +
        'const _outN=`out_${Ce.id}.${Qe.ext}`;' +
        'let _args;' +
        'if(i==="mp4")_args=["-framerate",String(we),"-i","fr_%06d.png","-c:v","libx264","-preset","medium","-crf","16","-pix_fmt","yuv422p","-movflags","+faststart",_outN];' +
        'else if(i==="prores")_args=["-framerate",String(we),"-i","fr_%06d.png","-c:v","prores_ks","-profile:v","4444","-pix_fmt",_Le?"yuva444p10le":"yuv444p10le","-vendor","apl0",...(_Le?["-alpha_bits","16"]:[]),_outN];' +
        'else if(i==="qt-anim")_args=["-framerate",String(we),"-i","fr_%06d.png","-c:v","qtrle","-pix_fmt",_Le?"argb":"rgb24",_outN];' +
        'else _args=["-framerate",String(we),"-i","fr_%06d.png","-c:v","rawvideo","-pix_fmt",_Le?"bgra":"bgr24",_outN];' +
        'const _totalSec=(Ie*2+He)/1000;' +
        'const _unsub=window.ltElectron.ffmpeg.onProgress(_sid,(sec)=>{' +
          'const _pg=Math.min((sec||0)/_totalSec,1);' +
          'z(Ce.id,{progress:55+Math.round(_pg*35)})' +
        '});' +
        'const _rr=await window.ltElectron.ffmpeg.run(_sid,_args,_outN);' +
        'try{_unsub()}catch(_){}' +
        'try{await window.ltElectron.ffmpeg.cleanup(_sid)}catch(_){}' +
        'if(!_rr||!_rr.ok)throw new Error(_rr&&_rr.error?_rr.error:"native ffmpeg run failed");' +
        'const _ob=_rr.buffer instanceof Uint8Array?_rr.buffer:new Uint8Array(_rr.buffer);' +
        'const _bt=new Blob([_ob],{type:Qe.mimeType});' +
        'if(!await ve(_bt,zt,Qe.mimeType)){z(Ce.id,{status:"error",error:"Cancelled"});continue}' +
        'z(Ce.id,{status:"done",progress:100});' +
        'continue' +
      '}' +
    '}' +
  '}catch(_e){console.warn("[LTG] native ffmpeg failed, falling back to wasm:",_e)}' +
'}' +
'const Le=u&&Qe.supportsAlpha,Pt=await gb';
const MARKER = '[LTG] native ffmpeg failed';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-native-ffmpeg] already applied"); return; }
  const n = src.split(OLD).length - 1;
  if (n !== 1) { console.error(`[patch-export-native-ffmpeg] expected 1 target, found ${n}`); process.exit(1); }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NATIVE_BRANCH), "utf8");
  console.log("[patch-export-native-ffmpeg] OK — Electron exports will prefer native ffmpeg when available");
}
main();
