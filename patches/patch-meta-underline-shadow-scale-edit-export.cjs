/*
 * patch-meta-underline-shadow-scale-edit-export.cjs
 *
 * Brings Edit and Export Meta-animation underline rendering in line with
 * the Live page (which already has these fixes via patch-underline-scale
 * and patch-shadow-zero-blur-and-underline):
 *
 *   1. Underline gets the same drop shadow the text does (via
 *      ctx.shadowBlur/OffsetX/OffsetY/Color, rendered AFTER the shadow
 *      pass so the underline sits above the shadow cloud, not under it,
 *      and does not cast a shadow-of-itself streak).
 *   2. Underline thickness, offset, font-size for measureText, and
 *      Y-from-text-top all scale by the current Meta scale factor
 *      (`na` in Edit `Ye()`, `ue` in Export `Tc()`) so the underline
 *      tracks the text as Meta grows 1.0x → 1.121x.
 *
 * Non-Meta fallback branches are not touched — they already match Live
 * for those animation types since scale==1.
 *
 * ATOMIC — if any target fails to match, the bundle is left untouched
 * (no partial writes).
 *
 * Idempotent.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

// -----------------------------------------------------------------------------
// EDIT — Ye() Meta underline block
// In-scope variables: H, G, D, n, l, c, $, _ulThick, _ulOff, ot, ke, Xe, f,
// fa, Fn, Bn, na, _dstX, _eyeY, qa, _titleY, Re.<line>.opacity, z, q, ie, te,
// U, oe.
// -----------------------------------------------------------------------------
const EDIT_OLD = 'if(D){if(n){H.font=jn;var _eUlWm=H.measureText(n).width,_eUlYm=_eyeY+fa+_ulOff;H.strokeStyle=$,H.lineWidth=_ulThick,H.globalAlpha=Re.eyebrow.opacity,H.beginPath(),H.moveTo(_dstX,_eUlYm),H.lineTo(_dstX+_eUlWm,_eUlYm),H.stroke();G.strokeStyle="#FFFFFF",G.font=jn,G.lineWidth=_ulThick,G.globalAlpha=Re.eyebrow.opacity,G.beginPath(),G.moveTo(_dstX,_eUlYm),G.lineTo(_dstX+_eUlWm,_eUlYm),G.stroke()}H.font=Gn;var _nUlW=H.measureText(l).width,_nUlY=qa+Fn+_ulOff;H.strokeStyle=$,H.lineWidth=_ulThick,H.globalAlpha=Re.name.opacity,H.beginPath(),H.moveTo(_dstX,_nUlY),H.lineTo(_dstX+_nUlW,_nUlY),H.stroke();H.font=Xa;var _tUlW=H.measureText(c).width,_tUlY=_titleY+Bn+_ulOff;H.lineWidth=_ulThick,H.globalAlpha=Re.title.opacity,H.beginPath(),H.moveTo(_dstX,_tUlY),H.lineTo(_dstX+_tUlW,_tUlY),H.stroke();G.strokeStyle="#FFFFFF",G.font=Gn,G.lineWidth=_ulThick,G.globalAlpha=Re.name.opacity,G.beginPath(),G.moveTo(_dstX,_nUlY),G.lineTo(_dstX+_nUlW,_nUlY),G.stroke();G.font=Xa,G.lineWidth=_ulThick,G.globalAlpha=Re.title.opacity,G.beginPath(),G.moveTo(_dstX,_tUlY),G.lineTo(_dstX+_tUlW,_tUlY),G.stroke();H.globalAlpha=1,G.globalAlpha=1}';

const EDIT_NEW = 'if(D){var _euLT=_ulThick*na,_euLO=_ulOff*na;if(z){var _euC=U,_euR=parseInt(_euC.slice(1,3),16)||0,_euG=parseInt(_euC.slice(3,5),16)||0,_euB=parseInt(_euC.slice(5,7),16)||0,_euA=Math.min(oe/100,1);H.shadowBlur=q;H.shadowOffsetX=ie;H.shadowOffsetY=te;H.shadowColor="rgba("+_euR+","+_euG+","+_euB+","+_euA+")"}else{H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0}if(n){H.font=`${ot} ${ke} ${fa*na}px "${f}", sans-serif`;var _eUlWm=H.measureText(n).width,_eUlYm=_eyeY+fa*na+_euLO;H.strokeStyle=$,H.lineWidth=_euLT,H.globalAlpha=Re.eyebrow.opacity,H.beginPath(),H.moveTo(_dstX,_eUlYm),H.lineTo(_dstX+_eUlWm,_eUlYm),H.stroke();G.strokeStyle="#FFFFFF",G.font=`${ot} ${ke} ${fa*na}px "${f}", sans-serif`,G.lineWidth=_euLT,G.globalAlpha=Re.eyebrow.opacity,G.beginPath(),G.moveTo(_dstX,_eUlYm),G.lineTo(_dstX+_eUlWm,_eUlYm),G.stroke()}H.font=`${ot} ${ke} ${Fn*na}px "${f}", sans-serif`;var _nUlW=H.measureText(l).width,_nUlY=qa+Fn*na+_euLO;H.strokeStyle=$,H.lineWidth=_euLT,H.globalAlpha=Re.name.opacity,H.beginPath(),H.moveTo(_dstX,_nUlY),H.lineTo(_dstX+_nUlW,_nUlY),H.stroke();H.font=`${ot} ${Xe} ${Bn*na}px "${f}", sans-serif`;var _tUlW=H.measureText(c).width,_tUlY=_titleY+Bn*na+_euLO;H.lineWidth=_euLT,H.globalAlpha=Re.title.opacity,H.beginPath(),H.moveTo(_dstX,_tUlY),H.lineTo(_dstX+_tUlW,_tUlY),H.stroke();G.strokeStyle="#FFFFFF",G.font=`${ot} ${ke} ${Fn*na}px "${f}", sans-serif`,G.lineWidth=_euLT,G.globalAlpha=Re.name.opacity,G.beginPath(),G.moveTo(_dstX,_nUlY),G.lineTo(_dstX+_nUlW,_nUlY),G.stroke();G.font=`${ot} ${Xe} ${Bn*na}px "${f}", sans-serif`,G.lineWidth=_euLT,G.globalAlpha=Re.title.opacity,G.beginPath(),G.moveTo(_dstX,_tUlY),G.lineTo(_dstX+_tUlW,_tUlY),G.stroke();H.globalAlpha=1,G.globalAlpha=1;H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0}';

// -----------------------------------------------------------------------------
// EXPORT — Tc() Meta-branch underline block
// In-scope variables: n (color ctx), p (cue.config), R (eyebrow text),
// b (output scale), ue (Meta scale), D/B/k (GSAP values), $/I/ve (fonts),
// fe/re/F (base line sizes), zt (eyebrow Y top), Qe/$e (name/title Y),
// oe (shared X origin).
// -----------------------------------------------------------------------------
const TC_OLD = 'if(p.underline){var _oUlT=(p.underlineThickness??2)*b,_oUlO=(p.underlineOffset??2)*b;n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0;if(R){n.font=$;const _ew=n.measureText(R).width,_euy=zt+fe+_oUlO;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=D.opacity,n.beginPath(),n.moveTo(oe,_euy),n.lineTo(oe+_ew,_euy),n.stroke()}n.font=I;const _nw=n.measureText(p.name).width;n.font=ve;const _tw=n.measureText(p.title).width;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=B.opacity,n.beginPath();const _uny=Qe+re+_oUlO,_uty=$e+F+_oUlO;n.moveTo(oe,_uny),n.lineTo(oe+_nw,_uny),n.stroke(),n.globalAlpha=k.opacity,n.beginPath(),n.moveTo(oe,_uty),n.lineTo(oe+_tw,_uty),n.stroke()}';

const TC_NEW = 'if(p.underline){var _oUlT=(p.underlineThickness??2)*b*ue,_oUlO=(p.underlineOffset??2)*b*ue;if(p.shadowEnabled){var _tSC=p.shadowColor??"#000000",_tSR=parseInt(_tSC.slice(1,3),16)||0,_tSG=parseInt(_tSC.slice(3,5),16)||0,_tSB=parseInt(_tSC.slice(5,7),16)||0,_tSA=Math.min((p.shadowStrength??100)/100,1);n.shadowBlur=(p.shadowBlur??10)*b;n.shadowOffsetX=(p.shadowOffsetX??0)*b;n.shadowOffsetY=(p.shadowOffsetY??0)*b;n.shadowColor="rgba("+_tSR+","+_tSG+","+_tSB+","+_tSA+")"}else{n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0}if(R){n.font=$;const _ew=n.measureText(R).width*ue,_euy=zt+fe*ue+_oUlO;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=D.opacity,n.beginPath(),n.moveTo(oe,_euy),n.lineTo(oe+_ew,_euy),n.stroke()}n.font=I;const _nw=n.measureText(p.name).width*ue;n.font=ve;const _tw=n.measureText(p.title).width*ue;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=B.opacity,n.beginPath();const _uny=Qe+re*ue+_oUlO,_uty=$e+F*ue+_oUlO;n.moveTo(oe,_uny),n.lineTo(oe+_nw,_uny),n.stroke(),n.globalAlpha=k.opacity,n.beginPath(),n.moveTo(oe,_uty),n.lineTo(oe+_tw,_uty),n.stroke();n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0}';

const EDIT_MARKER = 'var _euLT=_ulThick*na';
const TC_MARKER = '(p.underlineThickness??2)*b*ue';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  let editDone = false, tcDone = false;

  if (src.includes(EDIT_MARKER)) {
    editDone = true;
  } else {
    const n = src.split(EDIT_OLD).length - 1;
    if (n !== 1) {
      console.error(`[patch-meta-underline-shadow-scale-edit-export] Edit Meta underline: expected 1 target, found ${n} — aborting (no changes written)`);
      process.exit(1);
    }
    src = src.replace(EDIT_OLD, EDIT_NEW);
  }

  if (src.includes(TC_MARKER)) {
    tcDone = true;
  } else {
    const n = src.split(TC_OLD).length - 1;
    if (n !== 1) {
      console.error(`[patch-meta-underline-shadow-scale-edit-export] Tc Meta underline: expected 1 target, found ${n} — aborting (no changes written)`);
      process.exit(1);
    }
    src = src.replace(TC_OLD, TC_NEW);
  }

  if (src === original) {
    console.log("[patch-meta-underline-shadow-scale-edit-export] bundle already patched — nothing to do.");
    return;
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(`[patch-meta-underline-shadow-scale-edit-export] OK — edit:${editDone?"skip":"apply"} tc:${tcDone?"skip":"apply"}`);
}
main();
