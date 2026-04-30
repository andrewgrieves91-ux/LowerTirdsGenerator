/*
 * patch-live-kt-meta-unified-shadow.cjs
 *
 * Same temp-canvas unified-shadow refactor as
 * `patch-meta-unified-shadow.cjs` (which handled Tc Meta), now
 * applied to Live `Kt` (the live preview render).
 *
 * Order becomes:
 *   1. Alpha pass on `me` (broadcast alpha) — UNCHANGED
 *   2. Build a destination-sized temp canvas
 *   3. Draw the 3 factory regions (text+border) onto temp at dest
 *      positions with their per-element animation opacities
 *   4. Draw underline strokes onto temp at scaled dest positions
 *   5. Shadow loop on W: drawImage(temp) with drop-shadow filter
 *   6. Visible pass on W: drawImage(temp) without filter
 *   7. Underline strokes drawn ALSO on `me` (broadcast alpha)
 *      separately so the alpha plane contains the underline
 *
 * Single combined-mask drop-shadow halo around all elements,
 * underline visible on top of border, no internal stacking.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// The whole block from the alpha-pass end through the close of the
// `if(sn.current){...}` body (just before `}}}` closes the function).
// Anchor on the alpha pass title drawImage as the start, and the
// trailing `}` cleanup as the end.
const LIVE_OLD =
  // Alpha pass on me (eyebrow, name, title)
  'H.eyebrowContentW>0&&(me.save(),me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),me.restore());' +
  'me.save(),me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),me.restore();' +
  'me.save(),me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),me.restore();' +
  // Shadow filter setup
  'var _shF=(_e.config.shadowEnabled??!1)?function(){var _ox=_e.config.shadowOffsetX??0,_oy=_e.config.shadowOffsetY??0,_bl=_e.config.shadowBlur??10,_hx=_e.config.shadowColor??"#000000",_st=_e.config.shadowStrength??100,_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,_b=parseInt(_hx.slice(5,7),16)||0,_a=Math.min(_st/100,1);return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}():"none";' +
  'var _shSrcL=H.shadowCanvas||H.colorCanvas;' +
  // Shadow loop on W (3x drawImage with filter)
  'for(var _bpL=0;_bpL<(_e.config.shadowEnabled?Math.max(1,Math.ceil((_e.config.shadowBlur??10)/15)):0);_bpL++){' +
    'H.eyebrowContentW>0&&(W.save(),W.filter=_shF,W.globalAlpha=pn.opacity,W.drawImage(_shSrcL,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore());' +
    'W.save(),W.filter=_shF,W.globalAlpha=It.opacity,W.drawImage(_shSrcL,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();' +
    'W.save(),W.filter=_shF,W.globalAlpha=nn.opacity,W.drawImage(_shSrcL,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore()' +
  '}' +
  // Visible passes on W
  'H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore());' +
  'W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();' +
  'W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore();' +
  // Old underline block (with disabled shadow IIFEs)
  ';if(_e.config.underline){var _lUlT=(_e.config.underlineThickness??2)*tr,_lUlO=(_e.config.underlineOffset??2)*tr;' +
    'if(xn){' +
      'W.font=`${ea} ${rn} ${os*tr}px "${_e.config.font}", sans-serif`;' +
      'const _ew=W.measureText(xn).width,_euy=_Fn+os*tr+_lUlO;' +
      'var _euX=Oe+(H.eyebrowLogoOffset||0)*G;' +
      '(function(){W.shadowBlur=0;W.shadowOffsetX=0;W.shadowOffsetY=0})(),' +
      'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=pn.opacity,W.beginPath(),W.moveTo(_euX,_euy),W.lineTo(_euX+_ew,_euy),W.stroke();' +
      'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=pn.opacity,me.beginPath(),me.moveTo(_euX,_euy),me.lineTo(_euX+_ew,_euy),me.stroke()' +
    '}' +
    'W.font=`${ea} ${rn} ${mn*tr}px "${_e.config.font}", sans-serif`;' +
    'const _nw=W.measureText(_e.config.name).width;' +
    'W.font=`${ea} ${zn} ${jt*tr}px "${_e.config.font}", sans-serif`;' +
    'const _tw=W.measureText(_e.config.title).width;' +
    '(function(){W.shadowBlur=0;W.shadowOffsetX=0;W.shadowOffsetY=0})(),' +
    'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=It.opacity,W.beginPath();' +
    'const _uny=_Ga+mn*tr+_lUlO,_uty=_fa+jt*tr+_lUlO;' +
    'W.moveTo(Oe,_uny),W.lineTo(Oe+_nw,_uny),W.stroke(),W.globalAlpha=nn.opacity,W.beginPath(),W.moveTo(Oe,_uty),W.lineTo(Oe+_tw,_uty),W.stroke();' +
    'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=It.opacity,me.beginPath(),me.moveTo(Oe,_uny),me.lineTo(Oe+_nw,_uny),me.stroke(),me.globalAlpha=nn.opacity,me.beginPath(),me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke();' +
    'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0' +
  '}';

const LIVE_NEW =
  // Alpha pass on me — UNCHANGED
  'H.eyebrowContentW>0&&(me.save(),me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),me.restore());' +
  'me.save(),me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),me.restore();' +
  'me.save(),me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),me.restore();' +
  // Build temp canvas for unified shadow rendering on W context
  'const _mtLkTC=document.createElement("canvas");' +
  '_mtLkTC.width=W.canvas.width;_mtLkTC.height=W.canvas.height;' +
  'const _mtLkCtx=_mtLkTC.getContext("2d");' +
  '_mtLkCtx.textBaseline="top";_mtLkCtx.lineJoin="round";_mtLkCtx.lineCap="round";' +
  // Draw factory color regions onto temp at dest positions with opacities
  'H.eyebrowContentW>0&&(_mtLkCtx.save(),_mtLkCtx.globalAlpha=pn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),_mtLkCtx.restore());' +
  '_mtLkCtx.save(),_mtLkCtx.globalAlpha=It.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),_mtLkCtx.restore();' +
  '_mtLkCtx.save(),_mtLkCtx.globalAlpha=nn.opacity,_mtLkCtx.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),_mtLkCtx.restore();' +
  // Draw underline strokes onto temp (and also onto me for broadcast alpha)
  'if(_e.config.underline){' +
    'var _lUlT=(_e.config.underlineThickness??2)*tr,' +
        '_lUlO=(_e.config.underlineOffset??2)*tr;' +
    '_mtLkCtx.lineWidth=_lUlT;' +
    '_mtLkCtx.strokeStyle=_e.config.color;' +
    'me.strokeStyle="#FFFFFF";me.lineWidth=_lUlT;' +
    'if(xn){' +
      '_mtLkCtx.font=`${ea} ${rn} ${os*tr}px "${_e.config.font}", sans-serif`;' +
      'const _ew=_mtLkCtx.measureText(xn).width;' +
      'const _euy=_Fn+os*tr+_lUlO;' +
      'const _euX=Oe+(H.eyebrowLogoOffset||0)*G;' +
      '_mtLkCtx.globalAlpha=pn.opacity;' +
      '_mtLkCtx.beginPath();_mtLkCtx.moveTo(_euX,_euy);_mtLkCtx.lineTo(_euX+_ew,_euy);_mtLkCtx.stroke();' +
      'me.globalAlpha=pn.opacity;me.beginPath();me.moveTo(_euX,_euy);me.lineTo(_euX+_ew,_euy);me.stroke();' +
    '}' +
    '_mtLkCtx.font=`${ea} ${rn} ${mn*tr}px "${_e.config.font}", sans-serif`;' +
    'const _nw=_mtLkCtx.measureText(_e.config.name).width;' +
    '_mtLkCtx.font=`${ea} ${zn} ${jt*tr}px "${_e.config.font}", sans-serif`;' +
    'const _tw=_mtLkCtx.measureText(_e.config.title).width;' +
    'const _uny=_Ga+mn*tr+_lUlO;' +
    'const _uty=_fa+jt*tr+_lUlO;' +
    '_mtLkCtx.globalAlpha=It.opacity;' +
    '_mtLkCtx.beginPath();_mtLkCtx.moveTo(Oe,_uny);_mtLkCtx.lineTo(Oe+_nw,_uny);_mtLkCtx.stroke();' +
    '_mtLkCtx.globalAlpha=nn.opacity;' +
    '_mtLkCtx.beginPath();_mtLkCtx.moveTo(Oe,_uty);_mtLkCtx.lineTo(Oe+_tw,_uty);_mtLkCtx.stroke();' +
    'me.globalAlpha=It.opacity;me.beginPath();me.moveTo(Oe,_uny);me.lineTo(Oe+_nw,_uny);me.stroke();' +
    'me.globalAlpha=nn.opacity;me.beginPath();me.moveTo(Oe,_uty);me.lineTo(Oe+_tw,_uty);me.stroke();' +
  '}' +
  // Build drop-shadow filter
  'var _shF=(_e.config.shadowEnabled??!1)?function(){var _ox=_e.config.shadowOffsetX??0,_oy=_e.config.shadowOffsetY??0,_bl=_e.config.shadowBlur??10,_hx=_e.config.shadowColor??"#000000",_st=_e.config.shadowStrength??100,_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,_b=parseInt(_hx.slice(5,7),16)||0,_a=Math.min(_st/100,1);return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}():"none";' +
  // Shadow loop on W: drawImage(temp) with filter
  'for(var _bpL=0;_bpL<(_e.config.shadowEnabled?Math.max(1,Math.ceil((_e.config.shadowBlur??10)/15)):0);_bpL++){' +
    'W.save();W.filter=_shF;W.globalAlpha=1;W.drawImage(_mtLkTC,0,0);W.restore();' +
  '}' +
  // Visible: drawImage(temp) without filter — trailing `;` so next
  // statement (W.globalAlpha=1,...) parses cleanly.
  'W.save();W.globalAlpha=1;W.drawImage(_mtLkTC,0,0);W.restore();';

const MARKER = "_mtLkTC=document.createElement(\"canvas\")";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-live-kt-meta-unified-shadow] already applied");
    return;
  }

  const n = src.split(LIVE_OLD).length - 1;
  if (n === 0) {
    console.error("[patch-live-kt-meta-unified-shadow] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-live-kt-meta-unified-shadow] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(LIVE_OLD, LIVE_NEW);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-live-kt-meta-unified-shadow] OK — Live Kt Meta path now uses temp-canvas unified shadow");
}
main();
