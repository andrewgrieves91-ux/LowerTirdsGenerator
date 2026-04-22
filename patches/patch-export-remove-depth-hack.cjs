/*
 * patch-export-remove-depth-hack.cjs
 *
 * Narrows the post-encode MOV byte-patching block in
 * [dist/public/assets/index-iitzneuS.js] after a ProRes / QT RLE
 * WASM encode:
 *
 *   KEEP   — the per-frame `icpf` loop that sets
 *            alpha_channel_type (byte 22) 0 -> 1. This field lives
 *            inside the ProRes bitstream, not a muxer-controlled
 *            metadata field, and ffmpeg-wasm genuinely writes 0
 *            there even with yuva444p10le input. Premiere's decoder
 *            needs this flag to honour the per-frame alpha plane.
 *
 *   ADD    — a `console.warn` if the patch count is zero, so we
 *            notice immediately when a future ffmpeg-wasm upgrade
 *            starts setting this correctly and our patch becomes a
 *            no-op (or, conversely, when the bitstream layout shifts
 *            and our patch stops firing).
 *
 *   REMOVE — the `FFMP -> appl` vendor swap. With the companion
 *            patch-export-mov-alpha-args applied, ffmpeg already
 *            writes the `appl` vendor directly via `-vendor appl`.
 *            The post-hoc swap was fragile: it silently no-op'd
 *            whenever ffmpeg-wasm wrote anything other than the
 *            literal four bytes "FFMP" at that offset.
 *
 *   REMOVE — the depth-word flip 0x0020 -> 0x8020. QuickTime's
 *            depth is a 16-bit big-endian integer; 0x0020 (=32) is
 *            the correct "32-bit with alpha" value for both
 *            ProRes 4444 and ARGB QT RLE. Flipping to 0x8020 was
 *            tolerated by older Adobe readers but the Premiere 2026
 *            reader refuses to interpret the track as alpha.
 *
 * Same treatment for the QT RLE branch (`rle ` atom).
 *
 * Idempotent, atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

// --- ProRes branch ---------------------------------------------------------
const PRO_OLD =
  'const et=97,ht=112,Sa=52,za=104;let Bt=-1;for(let Me=ze.length-4;Me>=0;Me--)if(ze[Me]===et&&ze[Me+1]===ht&&ze[Me+2]===Sa&&ze[Me+3]===za){Bt=Me;break}if(Bt>=0){const Me=Bt+16;ze[Me]===70&&ze[Me+1]===70&&ze[Me+2]===77&&ze[Me+3]===80&&(ze[Me]=97,ze[Me+1]=112,ze[Me+2]=112,ze[Me+3]=108);const wt=Bt+78;ze[wt]===0&&ze[wt+1]===32&&(ze[wt]=128)}';
const PRO_NEW = 'if(fn===0)console.warn("[Export] ProRes alpha_channel_type patch found 0 icpf frame headers \u2014 file may not decode as transparent in Premiere. Consider installing native ffmpeg via `brew install ffmpeg`.")';

// --- QT RLE branch ---------------------------------------------------------
const RLE_OLD =
  'let fn=-1;for(let et=ze.length-4;et>=0;et--)if(ze[et]===114&&ze[et+1]===108&&ze[et+2]===101&&ze[et+3]===32){fn=et;break}if(fn>=0){const et=fn+16;ze[et]===70&&ze[et+1]===70&&ze[et+2]===77&&ze[et+3]===80&&(ze[et]=97,ze[et+1]=112,ze[et+2]=112,ze[et+3]=108);const ht=fn+78;ze[ht]===0&&ze[ht+1]===32&&(ze[ht]=128)}';
const RLE_NEW = '/* qt-rle metadata now set via ffmpeg -vendor appl + -tag:v "rle " */';

const MARKER_PRO = 'patch found 0 icpf frame headers';
const MARKER_RLE = 'metadata now set via ffmpeg';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  let didPro = false, didRle = false;

  if (src.includes(MARKER_PRO)) {
    console.log("[patch-export-remove-depth-hack] ProRes branch: already applied");
  } else {
    const n = src.split(PRO_OLD).length - 1;
    if (n !== 1) { console.error(`[patch-export-remove-depth-hack] ProRes target not found (matches=${n})`); process.exit(1); }
    src = src.replace(PRO_OLD, PRO_NEW);
    didPro = true;
  }

  if (src.includes(MARKER_RLE)) {
    console.log("[patch-export-remove-depth-hack] QT RLE branch: already applied");
  } else {
    const n = src.split(RLE_OLD).length - 1;
    if (n !== 1) { console.error(`[patch-export-remove-depth-hack] QT RLE target not found (matches=${n})`); process.exit(1); }
    src = src.replace(RLE_OLD, RLE_NEW);
    didRle = true;
  }

  if (src === original) { console.log("[patch-export-remove-depth-hack] nothing to change"); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  if (didPro) console.log("[patch-export-remove-depth-hack] ProRes branch: patched (depth hack + vendor swap removed; 0-count warn added)");
  if (didRle) console.log("[patch-export-remove-depth-hack] QT RLE branch: patched (depth hack + vendor swap removed)");
  console.log("[patch-export-remove-depth-hack] OK");
}
main();
