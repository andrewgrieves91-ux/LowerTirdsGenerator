/*
 * patch-shadow-tune-and-tc-nonmeta-filter.cjs
 *
 * Two related shadow tweaks:
 *
 * (A) Reduce the shadow density build-up factor.
 *
 *     The shadow render loop iterates `Math.max(1, Math.ceil(blur/10))`
 *     times, redrawing the source with the drop-shadow filter each
 *     iteration to compensate for the dispersion that the blur
 *     creates (each pass adds another opacity layer to the shadow
 *     halo). With a thick border, the source's alpha mask is wider
 *     to begin with — each iteration paints a wider shadow — and
 *     the multiplier compounds it into a "too large" halo. Changing
 *     the divisor from 10 → 15 cuts iteration count by ~33% at
 *     moderate blur values and ~30% at high blur, so the shadow
 *     stays the same SHAPE but is less dense / less prominent.
 *
 *     Three sites are updated:
 *       - Live `Kt` (factory-based render shadow loop)
 *       - Tc Meta (drop-shadow filter on `_srcC`)
 *       - Tc non-Meta (context `shadow*` strokeText + fillText loop)
 *
 * (B) Switch Tc non-Meta from context `shadow*` to drop-shadow CSS
 *     filter, mirroring Tc Meta.
 *
 *     The current non-Meta else-branch sets `n.shadowBlur/X/Y/Color`
 *     on the context, then in the for-loop calls `strokeText` (border)
 *     and `fillText` (fill). Each call paints its shape + a shadow
 *     underneath. Stroke shadow + fill shadow OVERLAP heavily, so the
 *     visible halo ends up looking like a fill-only shadow — i.e.
 *     the border doesn't appear to cast a meaningful shadow.
 *
 *     Fix: build a `_shFNMt` drop-shadow filter string once; inside
 *     each loop iteration set `n.filter = _shFNMt` so both strokeText
 *     and fillText pick it up. The combined alpha mask of stroke+fill
 *     produces ONE wider halo per iteration that visibly extends past
 *     the fill (matching Meta's appearance). Default offset is 0 (was
 *     a leftover `??3` in the old non-Meta path that disagreed with
 *     Meta's `??0`).
 *
 *     The existing `n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0;
 *     n.filter="none";` reset just after the loop already covers the
 *     teardown — no other change needed.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// (A) Iteration-count divisor adjustments — three distinct anchors.
const ITER_REPLACEMENTS = [
  // Live Kt
  {
    label: "Live Kt iter divisor",
    oldStr: "_e.config.shadowEnabled?Math.max(1,Math.ceil((_e.config.shadowBlur??10)/10)):0",
    newStr: "_e.config.shadowEnabled?Math.max(1,Math.ceil((_e.config.shadowBlur??10)/15)):0",
  },
  // Tc Meta
  {
    label: "Tc Meta iter divisor",
    oldStr: "for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/10));_bp++)",
    newStr: "for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/15));_bp++)",
  },
  // Tc non-Meta
  {
    label: "Tc non-Meta iter divisor",
    oldStr: "for(var _nbp=0;_nbp<(p.shadowEnabled?Math.max(1,Math.ceil((p.shadowBlur??10)/10)):0);_nbp++)",
    newStr: "for(var _nbp=0;_nbp<(p.shadowEnabled?Math.max(1,Math.ceil((p.shadowBlur??10)/15)):0);_nbp++)",
  },
];

// (B) Tc non-Meta: replace context-shadow setup with drop-shadow filter
// definition, and inject `n.filter=_shFNMt` at the start of the for-loop.
const NM_OLD_SETUP =
  'if(p.shadowEnabled){' +
    'n.shadowBlur=(p.shadowBlur??10)*b;' +
    'n.shadowOffsetX=(p.shadowOffsetX??3)*b;' +
    'n.shadowOffsetY=(p.shadowOffsetY??3)*b;' +
    'var _hx=p.shadowColor||"#000000";' +
    'var _st=p.shadowStrength??100;' +
    'var _r2=parseInt(_hx.slice(1,3),16)||0,_g2=parseInt(_hx.slice(3,5),16)||0,_b2=parseInt(_hx.slice(5,7),16)||0;' +
    'n.shadowColor="rgba("+_r2+","+_g2+","+_b2+","+Math.min(_st/100,1)+")"' +
  '}';

const NM_NEW_SETUP =
  // Build a drop-shadow filter string equivalent to what Meta uses.
  // Default offset is 0 so non-Meta matches Meta's `??0` default.
  'const _shFNMt=p.shadowEnabled?function(){' +
    'var _ox=(p.shadowOffsetX??0)*b,_oy=(p.shadowOffsetY??0)*b,_bl=(p.shadowBlur??10)*b,' +
        '_nmhx=p.shadowColor||"#000000",_nmst=p.shadowStrength??100,' +
        '_nmr=parseInt(_nmhx.slice(1,3),16)||0,' +
        '_nmg=parseInt(_nmhx.slice(3,5),16)||0,' +
        '_nmb=parseInt(_nmhx.slice(5,7),16)||0,' +
        '_nma=Math.min(_nmst/100,1);' +
    'return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_nmr+","+_nmg+","+_nmb+","+_nma+")"+")";' +
  '}():"none";';   // <-- trailing `;` separates this declaration from the
                   //     next `var _xLI=null` statement on the same line.

// Inject `n.filter=_shFNMt;` at the start of the loop body. The for-loop
// header is already `... ;_nbp++){` with the `{` opening the body. We add
// the filter assignment immediately after the brace.
const NM_LOOP_OPEN_OLD = ";_nbp++){if(R||f)";
const NM_LOOP_OPEN_NEW = ";_nbp++){n.filter=_shFNMt;if(R||f)";

// Idempotency marker — `_shFNMt` is unique to this patch.
const MARKER = "_shFNMt=p.shadowEnabled?function()";

function applyOnce(src, label, oldStr, newStr) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-shadow-tune-and-tc-nonmeta-filter] ${label}: anchor not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-shadow-tune-and-tc-nonmeta-filter] ${label}: anchor not unique (${n})`);
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

  if (src.includes(MARKER)) {
    console.log("[patch-shadow-tune-and-tc-nonmeta-filter] already applied");
    return;
  }

  // (A) iteration-divisor changes
  for (const r of ITER_REPLACEMENTS) {
    src = applyOnce(src, r.label, r.oldStr, r.newStr);
    console.log(`[patch-shadow-tune-and-tc-nonmeta-filter] ${r.label}: 10→15`);
  }

  // (B) Tc non-Meta: shadow setup → filter
  src = applyOnce(src, "Tc non-Meta shadow setup", NM_OLD_SETUP, NM_NEW_SETUP);
  console.log("[patch-shadow-tune-and-tc-nonmeta-filter] Tc non-Meta: replaced context shadow* with drop-shadow filter");

  // (B) Tc non-Meta: inject filter assignment at loop body start
  src = applyOnce(src, "Tc non-Meta loop filter inject", NM_LOOP_OPEN_OLD, NM_LOOP_OPEN_NEW);
  console.log("[patch-shadow-tune-and-tc-nonmeta-filter] Tc non-Meta: injected n.filter=_shFNMt at loop start");

  if (src === original) {
    console.log("[patch-shadow-tune-and-tc-nonmeta-filter] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-shadow-tune-and-tc-nonmeta-filter] OK");
}
main();
