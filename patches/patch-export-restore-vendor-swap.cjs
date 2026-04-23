/*
 * patch-export-restore-vendor-swap.cjs
 *
 * Restores the MOV container vendor swap that
 * `patch-export-remove-depth-hack.cjs` incorrectly deleted.
 *
 * Diagnosis: a ffmpeg-wasm export with `-c:v prores_ks -vendor appl`
 * and the new byte-patching still produced a MOV whose track sample-
 * description vendor was `FFMP`, not `appl`. Premiere Pro 2026's
 * ProRes decoder keys off that container-level vendor field to decide
 * whether to honour the alpha plane — `FFMP` is treated as non-Apple
 * ProRes, alpha ignored, clip appears opaque on V2.
 *
 * It turns out the ffmpeg `-vendor` CLI arg only writes the vendor
 * INSIDE the ProRes bitstream, not into the MOV container's
 * `stsd/ap4h/vendor` field. That field is written by the MOV muxer
 * as `FFMP` regardless of `-vendor appl`. The original code correctly
 * post-patched it; removing that post-patching was the regression.
 *
 * This patch re-inserts the two byte swaps (one for ProRes `ap4h`
 * and one for QT RLE `rle `) in their respective branches of the
 * post-encode fixup block. The suspect `0x0020 -> 0x8020` depth
 * hack is still not restored — that IS bad and Premiere 2026 rejects
 * it. Keeping depth at the standard 0x0020 and only swapping vendor
 * from `FFMP` to `appl`.
 *
 * Idempotent, atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// ── ProRes branch: append the vendor swap after the zero-count warn ─────────
const PRO_OLD = 'if(fn===0)console.warn("[Export] ProRes alpha_channel_type patch found 0 icpf frame headers — file may not decode as transparent in Premiere. Consider installing native ffmpeg via `brew install ffmpeg`.")';
const PRO_NEW = PRO_OLD +
  ';const et=97,ht=112,Sa=52,za=104;' +     // bytes for "ap4h"
  'let Bt=-1;' +
  'for(let Me=ze.length-4;Me>=0;Me--)' +
    'if(ze[Me]===et&&ze[Me+1]===ht&&ze[Me+2]===Sa&&ze[Me+3]===za){Bt=Me;break}' +
  'if(Bt>=0){' +
    'const Me=Bt+16;' +
    'if(ze[Me]===70&&ze[Me+1]===70&&ze[Me+2]===77&&ze[Me+3]===80){' + // "FFMP"
      'ze[Me]=97;ze[Me+1]=112;ze[Me+2]=112;ze[Me+3]=108' +            // → "appl"
    '}' +
  '}';

// ── QT RLE branch: replace placeholder comment with the same swap ───────────
const RLE_OLD = '/* qt-rle metadata now set via ffmpeg -vendor appl + -tag:v "rle " */';
const RLE_NEW =
  'let fn=-1;' +
  'for(let et=ze.length-4;et>=0;et--)' +
    'if(ze[et]===114&&ze[et+1]===108&&ze[et+2]===101&&ze[et+3]===32){fn=et;break}' + // "rle "
  'if(fn>=0){' +
    'const et=fn+16;' +
    'if(ze[et]===70&&ze[et+1]===70&&ze[et+2]===77&&ze[et+3]===80){' +                // "FFMP"
      'ze[et]=97;ze[et+1]=112;ze[et+2]=112;ze[et+3]=108' +                            // → "appl"
    '}' +
  '}';

const MARKER_PRO = 'const et=97,ht=112,Sa=52,za=104';
const MARKER_RLE = 'if(ze[et]===70&&ze[et+1]===70&&ze[et+2]===77';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER_PRO)) {
    console.log("[patch-export-restore-vendor-swap] ProRes branch: already applied");
  } else {
    const n = src.split(PRO_OLD).length - 1;
    if (n !== 1) { console.error(`[patch-export-restore-vendor-swap] ProRes target found ${n}x, aborting`); process.exit(1); }
    src = src.replace(PRO_OLD, PRO_NEW);
  }

  if (src.includes(MARKER_RLE)) {
    console.log("[patch-export-restore-vendor-swap] QT RLE branch: already applied");
  } else {
    const n = src.split(RLE_OLD).length - 1;
    if (n !== 1) { console.error(`[patch-export-restore-vendor-swap] QT RLE target found ${n}x, aborting`); process.exit(1); }
    src = src.replace(RLE_OLD, RLE_NEW);
  }

  if (src === original) { console.log("[patch-export-restore-vendor-swap] nothing to do"); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-export-restore-vendor-swap] OK — container vendor FFMP->appl swap restored for prores + qt-rle");
}
main();
