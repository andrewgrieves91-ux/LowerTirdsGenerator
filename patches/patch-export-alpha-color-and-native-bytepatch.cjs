/*
 * patch-export-alpha-color-and-native-bytepatch.cjs
 *
 * Two fixes for the Export pipeline that surface together when alpha
 * is enabled and the cue uses the Meta animation:
 *
 *   A) Color regression in `Tc()` (the per-frame export renderer).
 *      For Meta cues, the renderer used `_srcC = u ? alphaCanvas
 *      : colorCanvas`. The `alphaCanvas` is a pre-rendered glyph
 *      stencil filled with `#FFFFFF` — only meaningful as a matte
 *      for broadcast key/fill. Drawing it as the visible surface
 *      makes every text + border come out white, no matter what
 *      the user configured for `config.color` / `config.borderColor`.
 *      Likewise the logo path white-tints via `source-atop` fillRect
 *      when `u===true`. The fix is to always draw `colorCanvas` and
 *      to always draw the logo as-is. Alpha-on output gets its
 *      transparency from the `clearRect()` already done at the top of
 *      `Tc()` plus the canvas's natural per-pixel alpha — no fillStyle
 *      tinting required.
 *
 *   B) Container-level byte-patches were only being applied to the
 *      ffmpeg-WASM output buffer. The native ffmpeg path (Tier C1)
 *      returned `_rr.buffer` straight to a Blob, bypassing the
 *      `FFMP -> appl` vendor swap and the `icpf` frame-header
 *      `alpha_channel_type` 0 -> 1 fix. As a result, MOVs produced
 *      by the bundled native ffmpeg 7.1 (which we just hooked up)
 *      still had `vendor_id: FFMP` in `stsd/ap4h` and
 *      `alpha_channel_type=0x00` in every `icpf` header — exactly
 *      the same broken metadata the WASM byte-patch was written to
 *      fix. Premiere 2026 reads the alpha tag in Interpret Footage
 *      but refuses to honour the alpha plane on the timeline.
 *
 *      We re-use the byte-patch logic verbatim against the native
 *      path's `_ob` (Uint8Array). Same constants, same loops, same
 *      result. ProRes branch patches both icpf alpha + ap4h vendor;
 *      QT RLE branch patches the `rle ` atom vendor.
 *
 * Idempotent, atomic — bails out cleanly on a second run.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// ── A1) Tc Meta source-canvas ternary → always colorCanvas ────────────────
const SRC_OLD = "var _srcC=u?U.alphaCanvas:U.colorCanvas;";
const SRC_NEW = "var _srcC=U.colorCanvas;";

// ── A2) Tc logo branch 1 (non-Meta path) — drop the white tint ────────────
const LOGO1_OLD =
  'f&&(u?(n.save(),n.globalCompositeOperation="source-over",' +
  'n.drawImage(f,Qe,$e,we,le),' +
  'n.globalCompositeOperation="source-atop",n.fillStyle="#FFFFFF",' +
  'n.fillRect(Qe,$e,we,le),n.restore())' +
  ':n.drawImage(f,Qe,$e,we,le))';
const LOGO1_NEW = 'f&&n.drawImage(f,Qe,$e,we,le)';

// ── A3) Tc logo branch 2 (Meta deferred logo) — drop the white tint ──────
const LOGO2_OLD =
  'n.save();n.globalAlpha=_xLOp;' +
  'if(u){n.globalCompositeOperation="source-over";n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH);' +
  'n.globalCompositeOperation="source-atop";n.fillStyle="#FFFFFF";n.fillRect(_xLX,_xLY,_xLW,_xLH)}' +
  'else{n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH)}' +
  'n.restore()';
const LOGO2_NEW =
  'n.save();n.globalAlpha=_xLOp;n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH);n.restore()';

// ── B) Native ffmpeg path: byte-patch icpf + ap4h/rle vendor ─────────────
const NATIVE_OLD =
  'const _ob=_rr.buffer instanceof Uint8Array?_rr.buffer:new Uint8Array(_rr.buffer);' +
  'const _bt=new Blob([_ob],{type:Qe.mimeType});';

const NATIVE_NEW =
  'const _ob=_rr.buffer instanceof Uint8Array?_rr.buffer:new Uint8Array(_rr.buffer);' +
  // Byte-patch the native ffmpeg output — same logic the WASM branch uses.
  'if((i==="prores"||i==="qt-anim")&&_Le){' +
    'const _nze=_ob;' +
    'if(i==="prores"){' +
      'let _nfn=0;' +
      'for(let _nMe=0;_nMe<_nze.length-26;_nMe++)' +
        'if(_nze[_nMe]===105&&_nze[_nMe+1]===99&&_nze[_nMe+2]===112&&_nze[_nMe+3]===102){' +
          'const _nwt=_nze[_nMe+4]<<8|_nze[_nMe+5];' +
          '_nwt>=28&&_nwt<=200&&_nze[_nMe+22]===0&&(_nze[_nMe+22]=1,_nfn++)' +
        '}' +
      'console.log("[Export native] Patched alpha_type in "+_nfn+" ProRes frame headers");' +
      // ap4h vendor swap
      'const _net=97,_nht=112,_nSa=52,_nza=104;' +
      'let _nBt=-1;' +
      'for(let _nMe=_nze.length-4;_nMe>=0;_nMe--)' +
        'if(_nze[_nMe]===_net&&_nze[_nMe+1]===_nht&&_nze[_nMe+2]===_nSa&&_nze[_nMe+3]===_nza){_nBt=_nMe;break}' +
      'if(_nBt>=0){' +
        'const _nMe=_nBt+16;' +
        'if(_nze[_nMe]===70&&_nze[_nMe+1]===70&&_nze[_nMe+2]===77&&_nze[_nMe+3]===80){' +
          '_nze[_nMe]=97;_nze[_nMe+1]=112;_nze[_nMe+2]=112;_nze[_nMe+3]=108' +
        '}' +
      '}' +
    '}else{' +
      // qt-anim: find "rle " atom
      'let _nfn=-1;' +
      'for(let _net=_nze.length-4;_net>=0;_net--)' +
        'if(_nze[_net]===114&&_nze[_net+1]===108&&_nze[_net+2]===101&&_nze[_net+3]===32){_nfn=_net;break}' +
      'if(_nfn>=0){' +
        'const _net=_nfn+16;' +
        'if(_nze[_net]===70&&_nze[_net+1]===70&&_nze[_net+2]===77&&_nze[_net+3]===80){' +
          '_nze[_net]=97;_nze[_net+1]=112;_nze[_net+2]=112;_nze[_net+3]=108' +
        '}' +
      '}' +
    '}' +
  '}' +
  'const _bt=new Blob([_ob],{type:Qe.mimeType});';

// Idempotency markers — strings present ONLY after this patch is applied.
const MARKER_SRC = "var _srcC=U.colorCanvas;";
const MARKER_LOGO1 = "f&&n.drawImage(f,Qe,$e,we,le)";
const MARKER_LOGO2 = "n.save();n.globalAlpha=_xLOp;n.drawImage(_xLI,";
const MARKER_NATIVE = "[Export native] Patched alpha_type";

function applyOnce(src, label, oldStr, newStr, marker) {
  if (src.includes(marker)) {
    console.log(`[patch-export-alpha-color-and-native-bytepatch] ${label}: already applied`);
    return src;
  }
  const n = src.split(oldStr).length - 1;
  if (n !== 1) {
    console.error(
      `[patch-export-alpha-color-and-native-bytepatch] ${label}: expected exactly 1 anchor, found ${n} — aborting`
    );
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

  src = applyOnce(src, "Tc _srcC ternary", SRC_OLD, SRC_NEW, MARKER_SRC);
  src = applyOnce(src, "Tc logo branch 1", LOGO1_OLD, LOGO1_NEW, MARKER_LOGO1);
  src = applyOnce(src, "Tc logo branch 2 (Meta)", LOGO2_OLD, LOGO2_NEW, MARKER_LOGO2);
  src = applyOnce(src, "native byte-patch insertion", NATIVE_OLD, NATIVE_NEW, MARKER_NATIVE);

  if (src === original) {
    console.log("[patch-export-alpha-color-and-native-bytepatch] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(
    "[patch-export-alpha-color-and-native-bytepatch] OK — Meta colorCanvas restored, logo white-tint removed, native ffmpeg byte-patches active"
  );
}
main();
