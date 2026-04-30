/*
 * patch-export-border-rightclip.cjs
 *
 * When `config.borderEnabled` is true, the Export-page factory `_c()`
 * draws a border via `strokeText()` on top of `fillText()`. The stroke
 * extends `borderWidth/2` past the glyph fill bounds on every side.
 * The factory's canvas region width, however, only allocates the
 * advance/bbox width plus a tiny `+4` baseline pad — there's no
 * accommodation for the stroke. The Live-page factory `K()` already
 * adds `+_bw` (canvas-space border width) to each text width formula,
 * but `_c()` was never updated. Net effect: with a border on, the
 * exported MOV's right edge of each text element is clipped at the
 * source canvas before any per-frame drawImage runs.
 *
 * Fix: append `+(i.borderEnabled?(i.borderWidth||2)*_RS:0)` to the
 * three text-width constants `D` (eyebrow + logo), `k` (name), and
 * `L` (title). This adds a full canvas-space border-width of
 * additional buffer per element — generous enough to cover any
 * actual stroke half-width plus minor anti-aliasing on top of the
 * existing `+4` slack.
 *
 * `_RS` and `i` are both already in `_c()`'s closure so the inline
 * expression is safe.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const BORDER_ADD = "+(i.borderEnabled?(i.borderWidth||2)*_RS:0)";

const REPLACEMENTS = [
  {
    label: "D (eyebrow+logo region width)",
    oldStr: "D=Math.ceil(N+C+R)+4,B=Math.ceil(p)+4",
    newStr: "D=Math.ceil(N+C+R)+4" + BORDER_ADD + ",B=Math.ceil(p)+4",
  },
  {
    label: "k (name region width)",
    oldStr: "T.measureText(i.name);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4,M=Math.ceil(m)+4",
    newStr: "T.measureText(i.name);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4" + BORDER_ADD + ",M=Math.ceil(m)+4",
  },
  {
    label: "L (title region width)",
    oldStr: "T.measureText(i.title);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4,se=Math.ceil(v)+4",
    newStr: "T.measureText(i.title);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})())+4" + BORDER_ADD + ",se=Math.ceil(v)+4",
  },
];

// Idempotency marker — `D=Math.ceil(N+C+R)+4+(i.borderEnabled?` is unique to
// the post-patch state.
const MARKER = "D=Math.ceil(N+C+R)+4+(i.borderEnabled?";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-export-border-rightclip] already applied");
    return;
  }

  for (const r of REPLACEMENTS) {
    const n = src.split(r.oldStr).length - 1;
    if (n === 0) {
      console.error(`[patch-export-border-rightclip] ${r.label}: anchor not found`);
      process.exit(1);
    }
    if (n !== 1) {
      console.error(`[patch-export-border-rightclip] ${r.label}: anchor not unique (${n})`);
      process.exit(1);
    }
    src = src.replace(r.oldStr, r.newStr);
    console.log(`[patch-export-border-rightclip] ${r.label}: padded`);
  }

  if (src === original) {
    console.log("[patch-export-border-rightclip] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-export-border-rightclip] OK");
}
main();
