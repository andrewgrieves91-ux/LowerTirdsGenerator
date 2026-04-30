/*
 * patch-meta-unified-shadow.cjs
 *
 * Final, proper fix for the long-running underline/shadow z-order
 * issue in the three Meta-path renderers (Live `Kt`, Edit `Ye` Meta,
 * Tc Meta). User wants:
 *   1. Underline visible on top of border (so it's not hidden behind
 *      the colorCanvas's pre-rendered border pixels).
 *   2. Underline DOES have a shadow.
 *   3. The underline shadow lives on the SAME LAYER as the text
 *      shadow — i.e. one unified halo around the combined outer
 *      outline of (text + border + underline), no internal stacking.
 *
 * Temp-canvas approach (matching what the Edit non-Meta path
 * already uses):
 *
 *   1. Build a destination-sized temp canvas
 *   2. Draw the factory's text+border regions onto temp at their
 *      destination positions, with per-element animation opacity
 *   3. Draw the underline strokes onto temp at the same scaled
 *      destination positions, also with per-element opacity
 *   4. Shadow loop: drawImage(temp) with drop-shadow filter, N times
 *   5. Visible pass: drawImage(temp) without filter
 *
 * Drop-shadow on temp produces a single halo wrapping around the
 * union of (text + border + underline) — no separate underline
 * shadow, no over-text bleed, no border-over-underline.
 *
 * This patch handles only Tc Meta (Export render). The same approach
 * can be applied to Live `Kt` and Edit `Ye` Meta in follow-up
 * patches once the user verifies this works visually.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// The whole Tc Meta render section, from the `_dse` helper definition
// through the underline block's tail. We replace it as one unit.
const TC_OLD =
  '_dse=function(_c,_cv,_r,_dx,_dy,_a){_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);_c.scale(Q,Q);_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};n.restore();;if(p.shadowEnabled){var _shFE=function(){var _hx=p.shadowColor||"#000000",_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,_b=parseInt(_hx.slice(5,7),16)||0,_bl=(p.shadowBlur??10)*b,_ox=(p.shadowOffsetX??0)*b,_oy=(p.shadowOffsetY??0)*b,_a=Math.min((p.shadowStrength??100)/100,1);return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/15));_bp++){n.filter=_shFE;U.eyebrow.w>0&&_dse(n,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);_dse(n,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity)}n.filter="none"}U.eyebrow.w>0&&_dse(n,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);_dse(n,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);if(p.underline){var _oUlT=(p.underlineThickness??2)*b*ue,_oUlO=(p.underlineOffset??2)*b*ue;n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0;if(R){n.font=$;const _ew=n.measureText(R).width*ue,_euy=zt+fe*ue+_oUlO,_euX=oe+(U.eyebrowLogoOffset||0)*Q;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=D.opacity,n.beginPath(),n.moveTo(_euX,_euy),n.lineTo(_euX+_ew,_euy),n.stroke()}n.font=I;const _nw=n.measureText(p.name).width*ue;n.font=ve;const _tw=n.measureText(p.title).width*ue;n.strokeStyle=p.color,n.lineWidth=_oUlT,n.globalAlpha=B.opacity,n.beginPath();const _uny=Qe+re*ue+_oUlO,_uty=$e+F*ue+_oUlO;n.moveTo(oe,_uny),n.lineTo(oe+_nw,_uny),n.stroke(),n.globalAlpha=k.opacity,n.beginPath(),n.moveTo(oe,_uty),n.lineTo(oe+_tw,_uty),n.stroke();n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0};n.globalAlpha=1;;return';

const TC_NEW =
  '_dse=function(_c,_cv,_r,_dx,_dy,_a){_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);_c.scale(Q,Q);_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};n.restore();' +
  // Build temp canvas (destination-sized) and paint text+border+underline.
  'const _mtTC=document.createElement("canvas");' +
  '_mtTC.width=n.canvas.width;_mtTC.height=n.canvas.height;' +
  'const _mtCtx=_mtTC.getContext("2d");' +
  '_mtCtx.textBaseline="top";_mtCtx.lineJoin="round";_mtCtx.lineCap="round";' +
  // Draw factory regions onto temp
  'U.eyebrow.w>0&&_dse(_mtCtx,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);' +
  '_dse(_mtCtx,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);' +
  '_dse(_mtCtx,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);' +
  // Draw underline strokes onto temp at scaled destination positions
  'if(p.underline){' +
    'var _mtUlT=(p.underlineThickness??2)*b*ue;' +
    'var _mtUlO=(p.underlineOffset??2)*b*ue;' +
    '_mtCtx.lineWidth=_mtUlT;_mtCtx.strokeStyle=p.color;' +
    'if(R){' +
      '_mtCtx.font=$;' +
      'const _mtEw=_mtCtx.measureText(R).width*ue;' +
      'const _mtEy=zt+fe*ue+_mtUlO;' +
      'const _mtEx=oe+(U.eyebrowLogoOffset||0)*Q;' +
      '_mtCtx.globalAlpha=D.opacity;' +
      '_mtCtx.beginPath();' +
      '_mtCtx.moveTo(_mtEx,_mtEy);' +
      '_mtCtx.lineTo(_mtEx+_mtEw,_mtEy);' +
      '_mtCtx.stroke();' +
    '}' +
    '_mtCtx.font=I;' +
    'const _mtNw=_mtCtx.measureText(p.name).width*ue;' +
    '_mtCtx.font=ve;' +
    'const _mtTw=_mtCtx.measureText(p.title).width*ue;' +
    '_mtCtx.globalAlpha=B.opacity;' +
    'const _mtNy=Qe+re*ue+_mtUlO;' +
    '_mtCtx.beginPath();' +
    '_mtCtx.moveTo(oe,_mtNy);' +
    '_mtCtx.lineTo(oe+_mtNw,_mtNy);' +
    '_mtCtx.stroke();' +
    '_mtCtx.globalAlpha=k.opacity;' +
    'const _mtTy=$e+F*ue+_mtUlO;' +
    '_mtCtx.beginPath();' +
    '_mtCtx.moveTo(oe,_mtTy);' +
    '_mtCtx.lineTo(oe+_mtTw,_mtTy);' +
    '_mtCtx.stroke();' +
  '}' +
  // Shadow loop: drawImage(temp) with drop-shadow filter, N times.
  'if(p.shadowEnabled){' +
    'var _shFE=function(){var _hx=p.shadowColor||"#000000",_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,_b=parseInt(_hx.slice(5,7),16)||0,_bl=(p.shadowBlur??10)*b,_ox=(p.shadowOffsetX??0)*b,_oy=(p.shadowOffsetY??0)*b,_a=Math.min((p.shadowStrength??100)/100,1);return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();' +
    'for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/15));_bp++){' +
      'n.save();n.filter=_shFE;n.globalAlpha=1;n.drawImage(_mtTC,0,0);n.restore();' +
    '}' +
  '}' +
  // Visible pass: drawImage(temp) without filter.
  'n.globalAlpha=1;n.drawImage(_mtTC,0,0);' +
  'return';

const MARKER = "_mtTC=document.createElement(\"canvas\")";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-meta-unified-shadow] already applied");
    return;
  }

  const n = src.split(TC_OLD).length - 1;
  if (n === 0) {
    console.error("[patch-meta-unified-shadow] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-meta-unified-shadow] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(TC_OLD, TC_NEW);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-meta-unified-shadow] OK — Tc Meta now uses temp-canvas unified shadow");
}
main();
