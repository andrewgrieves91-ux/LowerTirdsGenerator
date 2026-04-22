/*
 * patch-underline-logo-offset-correct.cjs
 *
 * Corrects the eyebrow-underline X position for the "logo-before" case.
 *
 * Each offscreen factory now stores a new field `eyebrowLogoOffset` on
 * its returned cache struct. This is the horizontal offset (in factory
 * coords, i.e. at maxScale) from the eyebrow text's draw-origin start
 * to where the TEXT itself starts. It's 0 for no-logo or logo-after
 * cases; for logo-before it equals (logoW + logoGap) at max scale.
 *
 * The Live Kt render loop's underline-X calculation is then rewritten
 * from its current right-edge-minus-text-width formula — which was off
 * by `(textPad + border + drawPad) * G` pixels to the right — to a
 * direct and correct formula:
 *
 *   _euX = Oe + (H.eyebrowLogoOffset || 0) * G
 *
 * This also implicitly fixes the previously-unsupported non-Meta
 * logo-before case: slide/fade cues with a logo-before now also
 * place the underline under the text instead of starting at the
 * left edge of the eyebrow row.
 *
 * Factory modifications:
 *
 *   K()  (Live):   `eyebrowLogoOffset: je - vn`
 *                  (je = text draw X, vn = text draw X when no logo)
 *   xR() (Edit):   `eyebrowLogoOffset: Pt - Ce`
 *                  (Pt = text draw X, Ce = text draw X when no logo)
 *   _c() (Export): `eyebrowLogoOffset: De - q`
 *                  (De = text draw X, q = eyebrow region origin;
 *                   note: q is the baseline so De - q = logo offset)
 *
 * Edit and Export Meta underline blocks (already shadow+scale-patched)
 * also get their eyebrow-underline X shifted by the cache's
 * eyebrowLogoOffset so their Meta-logo-before cues also align.
 *
 * Idempotent, atomic.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OPS = [
  // --- Store eyebrowLogoOffset in each factory's returned struct ---
  {
    label: "K() — add eyebrowLogoOffset",
    old: "eyebrowContentW:Mt,eyebrowContentH:is}",
    new: "eyebrowContentW:Mt,eyebrowContentH:is,eyebrowLogoOffset:je-vn}",
    marker: "eyebrowContentH:is,eyebrowLogoOffset:je-vn",
  },
  {
    label: "xR() — add eyebrowLogoOffset",
    old: "eyebrowContentW:$,eyebrowContentH:I}",
    new: "eyebrowContentW:$,eyebrowContentH:I,eyebrowLogoOffset:Pt-Ce}",
    marker: "eyebrowContentH:I,eyebrowLogoOffset:Pt-Ce",
  },
  {
    label: "_c() — add eyebrowLogoOffset",
    old: "eyebrowContentW:D,eyebrowContentH:B}",
    new: "eyebrowContentW:D,eyebrowContentH:B,eyebrowLogoOffset:De-q}",
    marker: "eyebrowContentH:B,eyebrowLogoOffset:De-q",
  },

  // --- Live Kt: rewrite _euX calculation ---
  {
    label: "Live Kt — rewrite _euX using H.eyebrowLogoOffset",
    old: 'var _euX=(Yn&&_e.config.logoDataUrl&&(_e.config.logoPosition??"before")==="before")?(Oe-ke*G+H.eyebrow.w*G-_ew):Oe;',
    new: 'var _euX=Oe+(H.eyebrowLogoOffset||0)*G;',
    marker: "var _euX=Oe+(H.eyebrowLogoOffset||0)*G;",
  },

  // --- Edit Ye() Meta branch eyebrow underline: shift by _S.eyebrowLogoOffset ---
  //
  // Before: H.moveTo(_dstX,_eUlYm),H.lineTo(_dstX+_eUlWm,_eUlYm)
  // After:  compute _dstEX = _dstX + offset and use that.
  {
    label: "Edit Ye() Meta — shift eyebrow underline by logoOffset (color)",
    old: 'var _eUlWm=H.measureText(n).width,_eUlYm=_eyeY+fa*na+_euLO;H.strokeStyle=$,H.lineWidth=_euLT,H.globalAlpha=Re.eyebrow.opacity,H.beginPath(),H.moveTo(_dstX,_eUlYm),H.lineTo(_dstX+_eUlWm,_eUlYm),H.stroke();',
    new: 'var _eUlWm=H.measureText(n).width,_eUlYm=_eyeY+fa*na+_euLO,_eUlXm=_dstX+(_S.eyebrowLogoOffset||0)*_G;H.strokeStyle=$,H.lineWidth=_euLT,H.globalAlpha=Re.eyebrow.opacity,H.beginPath(),H.moveTo(_eUlXm,_eUlYm),H.lineTo(_eUlXm+_eUlWm,_eUlYm),H.stroke();',
    marker: "_eUlXm=_dstX+(_S.eyebrowLogoOffset||0)*_G",
  },
  {
    label: "Edit Ye() Meta — shift eyebrow underline by logoOffset (alpha)",
    old: 'G.strokeStyle="#FFFFFF",G.font=`${ot} ${ke} ${fa*na}px "${f}", sans-serif`,G.lineWidth=_euLT,G.globalAlpha=Re.eyebrow.opacity,G.beginPath(),G.moveTo(_dstX,_eUlYm),G.lineTo(_dstX+_eUlWm,_eUlYm),G.stroke()',
    new: 'G.strokeStyle="#FFFFFF",G.font=`${ot} ${ke} ${fa*na}px "${f}", sans-serif`,G.lineWidth=_euLT,G.globalAlpha=Re.eyebrow.opacity,G.beginPath(),G.moveTo(_eUlXm,_eUlYm),G.lineTo(_eUlXm+_eUlWm,_eUlYm),G.stroke()',
    marker: "G.beginPath(),G.moveTo(_eUlXm,_eUlYm)",
  },

  // --- Export Tc() Meta branch eyebrow underline: shift by U.eyebrowLogoOffset * Q ---
  // Q is the scale factor in Tc (= ue/U.maxScale).
  {
    label: "Tc() Meta — shift eyebrow underline by logoOffset",
    old: 'const _ew=n.measureText(R).width*ue,_euy=zt+fe*ue+_oUlO;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=D.opacity,n.beginPath(),n.moveTo(oe,_euy),n.lineTo(oe+_ew,_euy),n.stroke()',
    new: 'const _ew=n.measureText(R).width*ue,_euy=zt+fe*ue+_oUlO,_euX=oe+(U.eyebrowLogoOffset||0)*Q;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=D.opacity,n.beginPath(),n.moveTo(_euX,_euy),n.lineTo(_euX+_ew,_euy),n.stroke()',
    marker: "_euX=oe+(U.eyebrowLogoOffset||0)*Q",
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
      console.error(
        `[patch-underline-logo-offset-correct] ${op.label}: expected 1 target, found ${n} — aborting atomically (no changes written)`,
      );
      process.exit(1);
    }
    src = src.replace(op.old, op.new);
    results.push({ op, status: "apply" });
  }
  if (src === original) {
    console.log("[patch-underline-logo-offset-correct] bundle already patched — nothing to do.");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  for (const { op, status } of results) {
    console.log(`[patch-underline-logo-offset-correct] ${op.label}: ${status}`);
  }
  console.log("[patch-underline-logo-offset-correct] OK");
}
main();
