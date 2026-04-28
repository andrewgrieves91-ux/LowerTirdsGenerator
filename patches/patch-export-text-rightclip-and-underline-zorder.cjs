/*
 * patch-export-text-rightclip-and-underline-zorder.cjs
 *
 * Two render fixes the user spotted right after the alpha/color fix:
 *
 * (A) Text being clipped at the right edge.
 *
 *     Each factory (`K()` Live, `_c()` Export) creates a pre-render
 *     canvas sized to the *advance* width returned by ctx.measureText
 *     (i.e. the cursor-advance distance). That ignores the painted
 *     bounding box, which can extend past the advance for italic
 *     glyphs, ligatures, and just-anti-aliasing. The rightmost pixels
 *     spill outside the canvas region and get clipped at source.
 *
 *     Fix: take Math.max(width, actualBoundingBoxRight || 0). The
 *     `actualBoundingBoxRight` field has been universally available
 *     in Canvas TextMetrics for years (Chromium since 2018) so the
 *     `|| 0` fallback only kicks in for the rare case where it returns
 *     undefined.
 *
 *     Patched in `K()` (Live factory) and `_c()` (Export factory) for
 *     name + title + eyebrow text. (Edit factory `xR()` left alone for
 *     now — user is testing export specifically. Easy to extend later.)
 *
 * (B) Underline shadow appearing OVER the text.
 *
 *     In Tc's Meta-animation render, the visible-text passes draw
 *     first, then the underline strokes are drawn with `n.shadow*`
 *     set on the main context. The underline's blurred shadow can
 *     bleed UP into the already-drawn text region — visually showing
 *     up on top of the text.
 *
 *     Fix: hoist the entire `if(p.underline){...}` block to BEFORE
 *     the text shadow loop and visible passes. The underline (with
 *     its shadow) lands on the otherwise-empty canvas first; then
 *     the text-shadow drop-shadow pass and the visible text passes
 *     lay down on top, naturally covering any underline-shadow that
 *     bled into the text bounding box. The block itself ends with
 *     `n.shadow* = 0` resets, so the subsequent text shadow loop
 *     starts from a clean state.
 *
 * Idempotent. Atomic — bails on second-run if any anchor is missing.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Helper: produce an inline IIFE that returns Math.max(width, actualBoundingBoxRight||0)
// Pattern: `<ctx>.measureText(<text>).width`
//   ->     `(()=>{const _m=<ctx>.measureText(<text>);return Math.max(_m.width,_m.actualBoundingBoxRight||0)})()`
function widthExpr(ctx, text) {
  return `(()=>{const _m=${ctx}.measureText(${text});return Math.max(_m.width,_m.actualBoundingBoxRight||0)})()`;
}

// ─── (A) text width replacements ──────────────────────────────────────────
const REPLACEMENTS = [
  // Export factory _c()
  {
    label: "_c name width",
    oldStr: "Math.ceil(T.measureText(i.name).width)+4",
    newStr: `Math.ceil(${widthExpr("T", "i.name")})+4`,
  },
  {
    label: "_c title width",
    oldStr: "Math.ceil(T.measureText(i.title).width)+4",
    newStr: `Math.ceil(${widthExpr("T", "i.title")})+4`,
  },
  {
    label: "_c eyebrow width (var N)",
    oldStr: "const N=_?T.measureText(_).width:0",
    newStr: `const N=_?${widthExpr("T", "_")}:0`,
  },
  // Live factory K()
  {
    label: "K name width",
    oldStr: "Math.ceil(Ta.measureText(V.config.name).width)+4+_bw",
    newStr: `Math.ceil(${widthExpr("Ta", "V.config.name")})+4+_bw`,
  },
  {
    label: "K title width",
    oldStr: "Math.ceil(Ta.measureText(V.config.title).width)+4+_bw",
    newStr: `Math.ceil(${widthExpr("Ta", "V.config.title")})+4+_bw`,
  },
  {
    label: "K eyebrow width (var En)",
    oldStr: "const En=Ea?Ta.measureText(Ea).width:0",
    newStr: `const En=Ea?${widthExpr("Ta", "Ea")}:0`,
  },
];

// ─── (B) Underline reorder in Tc Meta path ────────────────────────────────
// We extract the existing block from the bundle (avoids hard-coding 1.2KB
// of minified JS in this patch script). Patterns:
//   - The block STARTS at `if(p.underline){` immediately after `n.globalAlpha=1;`
//   - The block ENDS at the matching `}` (balanced brace match, string-aware).
//   - We then:
//       1) replace `n.globalAlpha=1;<BLOCK>` with `n.globalAlpha=1;`  (remove)
//       2) replace the shadow-loop anchor with `<BLOCK>;<anchor>` (insert before)
const ANCHOR_BEFORE_SHADOW = "n.restore();if(p.shadowEnabled){var _shFE=function(){";
const ANCHOR_TC_UNDERLINE = "n.globalAlpha=1;if(p.underline){var _oUlT=";

function findMatchingBrace(src, startIdx) {
  // startIdx points at the opening '{'; returns idx after the matching '}'
  let depth = 0;
  let i = startIdx;
  let inStr = null;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === "\\" && i + 1 < src.length) { i += 2; continue; }
      if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'" || c === "`") {
      inStr = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

// Idempotency markers
const MARKER_WIDTH = "_m.actualBoundingBoxRight||0";       // unique to (A) replacements
const MARKER_REORDER_BEFORE = "n.restore();if(p.underline){var _oUlT="; // unique to post-move state

function applyOnce(src, label, oldStr, newStr) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.log(`[patch-text-rightclip-and-underline-zorder] ${label}: anchor not found — assuming already applied`);
    return src;
  }
  if (n !== 1) {
    console.error(`[patch-text-rightclip-and-underline-zorder] ${label}: expected exactly 1 anchor, found ${n} — aborting`);
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

  // ── (A) text-width fixes ────────────────────────────────────────────────
  if (src.includes(MARKER_WIDTH)) {
    console.log("[patch-text-rightclip-and-underline-zorder] (A) width fixes: already applied");
  } else {
    for (const r of REPLACEMENTS) {
      const before = src;
      src = applyOnce(src, `(A) ${r.label}`, r.oldStr, r.newStr);
      if (src === before) {
        console.error(`[patch-text-rightclip-and-underline-zorder] (A) ${r.label}: nothing replaced — aborting`);
        process.exit(1);
      }
    }
    console.log("[patch-text-rightclip-and-underline-zorder] (A) width fixes: applied");
  }

  // ── (B) underline reorder ───────────────────────────────────────────────
  if (src.includes(MARKER_REORDER_BEFORE)) {
    console.log("[patch-text-rightclip-and-underline-zorder] (B) underline reorder: already applied");
  } else {
    // Locate the underline block fresh (its byte offsets may have shifted because
    // of (A)'s replacements above).
    const blockStart = src.indexOf(ANCHOR_TC_UNDERLINE);
    if (blockStart < 0) {
      console.error("[patch-text-rightclip-and-underline-zorder] (B) underline anchor not found");
      process.exit(1);
    }
    // Block opening brace = right after `if(p.underline)` — the first `{` after blockStart
    const braceStart = src.indexOf("{", blockStart + "n.globalAlpha=1;if(p.underline)".length);
    if (braceStart < 0) {
      console.error("[patch-text-rightclip-and-underline-zorder] (B) couldn't locate `{` of underline block");
      process.exit(1);
    }
    const braceEnd = findMatchingBrace(src, braceStart);
    if (braceEnd < 0) {
      console.error("[patch-text-rightclip-and-underline-zorder] (B) couldn't balance braces of underline block");
      process.exit(1);
    }
    const ifStart = blockStart + "n.globalAlpha=1;".length;            // at `if(p.underline){`
    const block = src.slice(ifStart, braceEnd);                         // `if(p.underline){...}`

    // 1) remove block from after-text location
    const removeOld = "n.globalAlpha=1;" + block;
    const removeNew = "n.globalAlpha=1;";
    if (src.split(removeOld).length - 1 !== 1) {
      console.error("[patch-text-rightclip-and-underline-zorder] (B) remove: anchor not unique");
      process.exit(1);
    }
    src = src.replace(removeOld, removeNew);

    // 2) insert block before shadow loop
    if (src.split(ANCHOR_BEFORE_SHADOW).length - 1 !== 1) {
      console.error("[patch-text-rightclip-and-underline-zorder] (B) insert: shadow-loop anchor not unique");
      process.exit(1);
    }
    src = src.replace(
      ANCHOR_BEFORE_SHADOW,
      "n.restore();" + block + ";if(p.shadowEnabled){var _shFE=function(){"
    );
    console.log("[patch-text-rightclip-and-underline-zorder] (B) underline reorder: applied (block size " + block.length + " chars)");
  }

  if (src === original) {
    console.log("[patch-text-rightclip-and-underline-zorder] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-text-rightclip-and-underline-zorder] OK");
}
main();
