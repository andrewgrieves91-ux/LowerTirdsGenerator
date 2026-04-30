/*
 * patch-edit-ye-non-meta-factory.cjs
 *
 * Edit `Ye` only enters the factory branch when `An && Oe` (Meta only).
 * Live `Kt` and Export `Tc` use the factory output for ALL animation
 * types (any non-syncTest). Non-Meta animations in Edit therefore get
 * direct strokeText/fillText at 1x rasterization, while Live and Export
 * get oversampled-then-downsampled glyphs. The result: visibly different
 * glyph edges for non-Meta cues between Edit and Live/Export.
 *
 * Restructures the renderer:
 *
 *   OLD:  if (An && Oe) { <meta-factory> } else { <direct> }
 *   NEW:  if (Oe)       { if (An) { <meta-factory> }
 *                         else    { <non-meta-factory> } }
 *         else          { <direct> (only when Oe is null, e.g. syncTest) }
 *
 * The new non-meta factory block mirrors the meta-factory unified-shadow
 * structure but uses per-element X (`L+Re.<el>.x`) and per-element Y
 * (`<base>+Re.<el>.y`), with na=1 so no meta-scale is applied.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Step 1: open `if(Oe){if(An){` instead of `if(An&&Oe){`.
const STEP1_OLD = "if(An&&Oe){var _S=Oe,_G=na/_S.maxScale";
const STEP1_NEW = "if(Oe){if(An){var _S=Oe,_G=na/_S.maxScale";

// Step 2: at the close of meta path (uniquely `}H.globalAlpha=1,G.globalAlpha=1;}else{var _shFNM=`),
// inject the non-meta factory branch + extra closing brace so the existing
// `else{<direct>}` becomes the else of the outer `if(Oe){`.
const NM = (
  // Open block and pull out factory + scale.
  "{" +
  "var _Sn=Oe,_Gn=1/_Sn.maxScale,_padn=_Sn.drawPad;" +
  // Per-element destination X (each element animates independently in non-meta).
  "var _eXn=L+Re.eyebrow.x,_nXn=L+Re.name.x,_tXn=L+Re.title.x;" +
  // Per-element destination Y (mirrors Live Kt non-meta: base Y + Re.<el>.y).
  "var _eYn=ds+Re.eyebrow.y,_nYn=qa+Re.name.y,_tYn=Aa+Re.title.y;" +
  // Alpha pass on G (broadcast).
  "_Sn.eyebrowContentW>0&&(G.save(),G.globalAlpha=Re.eyebrow.opacity,G.drawImage(_Sn.alphaCanvas,_Sn.eyebrow.x,_Sn.eyebrow.y,_Sn.eyebrow.w,_Sn.eyebrow.h,_eXn-_padn*_Gn,_eYn-_padn*_Gn,_Sn.eyebrow.w*_Gn,_Sn.eyebrow.h*_Gn),G.restore());" +
  "G.save(),G.globalAlpha=Re.name.opacity,G.drawImage(_Sn.alphaCanvas,_Sn.name.x,_Sn.name.y,_Sn.name.w,_Sn.name.h,_nXn-_padn*_Gn,_nYn-_padn*_Gn,_Sn.name.w*_Gn,_Sn.name.h*_Gn),G.restore();" +
  "G.save(),G.globalAlpha=Re.title.opacity,G.drawImage(_Sn.alphaCanvas,_Sn.title.x,_Sn.title.y,_Sn.title.w,_Sn.title.h,_tXn-_padn*_Gn,_tYn-_padn*_Gn,_Sn.title.w*_Gn,_Sn.title.h*_Gn),G.restore();" +
  // Build temp canvas (cached per Phase 2 patch).
  'var _mtNmE=globalThis.__ltGetMtCanvas("ye-nm",H.canvas.width,H.canvas.height);' +
  "var _mtNmTC=_mtNmE.c;var _mtNmCtx=_mtNmE.x;" +
  // Draw factory color regions onto temp at per-element dest positions.
  "_Sn.eyebrowContentW>0&&(_mtNmCtx.save(),_mtNmCtx.globalAlpha=Re.eyebrow.opacity,_mtNmCtx.drawImage(_Sn.colorCanvas,_Sn.eyebrow.x,_Sn.eyebrow.y,_Sn.eyebrow.w,_Sn.eyebrow.h,_eXn-_padn*_Gn,_eYn-_padn*_Gn,_Sn.eyebrow.w*_Gn,_Sn.eyebrow.h*_Gn),_mtNmCtx.restore());" +
  "_mtNmCtx.save(),_mtNmCtx.globalAlpha=Re.name.opacity,_mtNmCtx.drawImage(_Sn.colorCanvas,_Sn.name.x,_Sn.name.y,_Sn.name.w,_Sn.name.h,_nXn-_padn*_Gn,_nYn-_padn*_Gn,_Sn.name.w*_Gn,_Sn.name.h*_Gn),_mtNmCtx.restore();" +
  "_mtNmCtx.save(),_mtNmCtx.globalAlpha=Re.title.opacity,_mtNmCtx.drawImage(_Sn.colorCanvas,_Sn.title.x,_Sn.title.y,_Sn.title.w,_Sn.title.h,_tXn-_padn*_Gn,_tYn-_padn*_Gn,_Sn.title.w*_Gn,_Sn.title.h*_Gn),_mtNmCtx.restore();" +
  // Underlines onto temp + G (broadcast). Non-meta: scale=1, fonts at base size.
  "if(D){" +
    "var _euLTn=_ulThick,_euLOn=_ulOff;" +
    "_mtNmCtx.lineWidth=_euLTn;_mtNmCtx.strokeStyle=$;" +
    'G.strokeStyle="#FFFFFF";G.lineWidth=_euLTn;' +
    "if(n){" +
      "_mtNmCtx.font=`${ot} ${ke} ${fa}px \"${f}\", sans-serif`;" +
      "G.font=_mtNmCtx.font;" +
      "var _eUlWn=_mtNmCtx.measureText(n).width;" +
      "var _eUlYn=_eYn+fa+_euLOn;" +
      "var _eUlXn=_eXn+(_Sn.eyebrowLogoOffset||0)*_Gn;" +
      "_mtNmCtx.globalAlpha=Re.eyebrow.opacity;" +
      "_mtNmCtx.beginPath();_mtNmCtx.moveTo(_eUlXn,_eUlYn);_mtNmCtx.lineTo(_eUlXn+_eUlWn,_eUlYn);_mtNmCtx.stroke();" +
      "G.globalAlpha=Re.eyebrow.opacity;" +
      "G.beginPath();G.moveTo(_eUlXn,_eUlYn);G.lineTo(_eUlXn+_eUlWn,_eUlYn);G.stroke();" +
    "}" +
    "_mtNmCtx.font=`${ot} ${ke} ${Fn}px \"${f}\", sans-serif`;" +
    "G.font=_mtNmCtx.font;" +
    "var _nUlWn=_mtNmCtx.measureText(l).width;" +
    "var _nUlYn=_nYn+Fn+_euLOn;" +
    "_mtNmCtx.globalAlpha=Re.name.opacity;" +
    "_mtNmCtx.beginPath();_mtNmCtx.moveTo(_nXn,_nUlYn);_mtNmCtx.lineTo(_nXn+_nUlWn,_nUlYn);_mtNmCtx.stroke();" +
    "G.globalAlpha=Re.name.opacity;" +
    "G.beginPath();G.moveTo(_nXn,_nUlYn);G.lineTo(_nXn+_nUlWn,_nUlYn);G.stroke();" +
    "_mtNmCtx.font=`${ot} ${Xe} ${Bn}px \"${f}\", sans-serif`;" +
    "G.font=_mtNmCtx.font;" +
    "var _tUlWn=_mtNmCtx.measureText(c).width;" +
    "var _tUlYn=_tYn+Bn+_euLOn;" +
    "_mtNmCtx.globalAlpha=Re.title.opacity;" +
    "_mtNmCtx.beginPath();_mtNmCtx.moveTo(_tXn,_tUlYn);_mtNmCtx.lineTo(_tXn+_tUlWn,_tUlYn);_mtNmCtx.stroke();" +
    "G.globalAlpha=Re.title.opacity;" +
    "G.beginPath();G.moveTo(_tXn,_tUlYn);G.lineTo(_tXn+_tUlWn,_tUlYn);G.stroke();" +
  "}" +
  // Drop-shadow filter (z = shadowEnabled).
  'var _shFNF=z?function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}():"none";' +
  // Shadow loop on H.
  "for(var _bpn=0;_bpn<(z?Math.max(1,Math.ceil(q/15)):0);_bpn++){" +
    "H.save();H.filter=_shFNF;H.globalAlpha=1;H.drawImage(_mtNmTC,0,0);H.restore();" +
  "}" +
  // Visible draw on H.
  "H.save();H.globalAlpha=1;H.drawImage(_mtNmTC,0,0);H.restore();" +
  "H.globalAlpha=1;G.globalAlpha=1;" +
  "}"
);

const STEP2_OLD = "}H.globalAlpha=1,G.globalAlpha=1;}else{var _shFNM=";
const STEP2_NEW = "}H.globalAlpha=1,G.globalAlpha=1;}else" + NM + "}else{var _shFNM=";

const MARKER = "_mtNmE=globalThis.__ltGetMtCanvas(\"ye-nm\"";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-edit-ye-non-meta-factory] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-ye-non-meta-factory] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-edit-ye-non-meta-factory] already applied");
    return;
  }
  src = applyOnce(src, STEP1_OLD, STEP1_NEW, "step1 (open if-Oe-if-An)");
  src = applyOnce(src, STEP2_OLD, STEP2_NEW, "step2 (insert non-meta + close if-Oe)");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-ye-non-meta-factory] OK — Edit Ye non-Meta now uses factory like Kt/Tc");
}
main();
