/*
 * patch-export-mov-alpha-args.cjs
 *
 * Two surgical ffmpeg-arg fixes so MOV exports (ProRes 4444 + QT RLE)
 * are recognised as transparent by Premiere Pro 2026 without needing
 * post-encode byte patching of the container.
 *
 *   1. `-vendor apl0`  ->  `-vendor appl`
 *        Writes the Apple vendor tag directly into the ProRes sample
 *        description. The old value `apl0` + the post-hoc FFMP->appl
 *        swap was fragile (it silently no-op'd whenever ffmpeg-wasm
 *        wrote anything other than literal "FFMP" at that offset).
 *
 *   2. Add `-tag:v ap4h` to ProRes args and `-tag:v "rle "` to QT RLE
 *        args. Forces the track's fourcc codec tag to the Apple value
 *        that Premiere matches against. Safe on modern ffmpeg / ffmpeg-
 *        wasm (both accept `-tag:v`) and a no-op if already correct.
 *
 * Applied to all four arg sites:
 *   - WASM path ProRes
 *   - WASM path QT RLE
 *   - Native (Electron IPC) path ProRes
 *   - Native (Electron IPC) path QT RLE
 *
 * Idempotent, atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OPS = [
  {
    label: "both paths: -vendor apl0 -> appl (both sites)",
    old: '"-vendor","apl0"',
    new: '"-vendor","appl"',
    marker: '"-vendor","appl"',
    expect: 2,
    replaceAll: true,
  },
  {
    label: "WASM prores args: append -tag:v ap4h",
    old: '"-alpha_bits","16"]:[],At]',
    new: '"-alpha_bits","16","-tag:v","ap4h"]:["-tag:v","ap4h"],At]',
    marker: '"-alpha_bits","16","-tag:v","ap4h"]:["-tag:v","ap4h"]',
    expect: 1,
  },
  {
    label: "Native prores args: append -tag:v ap4h",
    old: '"-alpha_bits","16"]:[]),_outN]',
    new: '"-alpha_bits","16","-tag:v","ap4h"]:["-tag:v","ap4h"]),_outN]',
    marker: '"-alpha_bits","16","-tag:v","ap4h"]:["-tag:v","ap4h"]),_outN]',
    expect: 1,
  },
  {
    label: 'WASM qt-anim args: append -tag:v "rle "',
    old: '"rgb24",At]',
    new: '"rgb24","-tag:v","rle ",At]',
    marker: '"rgb24","-tag:v","rle ",At]',
    expect: 1,
  },
  {
    label: 'Native qt-anim args: append -tag:v "rle "',
    old: '"rgb24",_outN]',
    new: '"rgb24","-tag:v","rle ",_outN]',
    marker: '"rgb24","-tag:v","rle ",_outN]',
    expect: 1,
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  const results = [];
  for (const op of OPS) {
    if (src.includes(op.marker)) { results.push({ op, status: "already" }); continue; }
    const n = src.split(op.old).length - 1;
    if (n !== op.expect) {
      console.error(`[patch-export-mov-alpha-args] ${op.label}: expected ${op.expect}, found ${n} — aborting`);
      process.exit(1);
    }
    src = op.replaceAll ? src.split(op.old).join(op.new) : src.replace(op.old, op.new);
    results.push({ op, status: "apply" });
  }
  if (src === original) { console.log("[patch-export-mov-alpha-args] already fully applied"); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  for (const { op, status } of results) console.log(`[patch-export-mov-alpha-args] ${op.label}: ${status}`);
  console.log("[patch-export-mov-alpha-args] OK");
}
main();
