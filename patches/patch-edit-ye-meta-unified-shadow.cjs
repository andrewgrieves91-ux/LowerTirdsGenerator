/*
 * patch-edit-ye-meta-unified-shadow.cjs
 *
 * Rewrites the Edit `Ye` Meta path to use the same temp-canvas
 * unified-shadow approach as Live Kt and Tc (Export). The previous
 * structure was:
 *
 *   if(z){
 *     [shadow loop]
 *     [visible passes]
 *     if(D){[underline strokes — shadow disabled]}
 *   } else {
 *     [visible passes only]
 *   }
 *
 * which means the underline shadow was missing AND when shadow was
 * disabled the underline never rendered at all.
 *
 * New structure:
 *   - Build dest-sized temp canvas
 *   - Draw factory color regions onto temp at scaled positions w/ opacities
 *   - Draw underline strokes onto temp + onto G (alpha plane)
 *   - Build _shFM filter (or "none" if z is false)
 *   - Shadow loop: drawImage(temp) on H with filter (0 iterations if z=false)
 *   - Visible: drawImage(temp) on H without filter
 *
 * Idempotent + atomic. OLD is loaded from /tmp/edit_ye_meta_old.txt.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// EDIT_OLD: the entire `if(z){...}else{...}` Edit Ye Meta block from a
// previously-patched bundle, base64-encoded so we don't need to escape
// backticks/braces inside this CJS file.
const EDIT_OLD_B64 =
  "aWYoeil7dmFyIF9zaEZNPWZ1bmN0aW9uKCl7dmFyIF9yPXBhcnNlSW50KFUuc2xpY2UoMSwzKSwxNil8fDAsX2c9cGFyc2VJbnQoVS5zbGljZSgzLDUpLDE2KXx8MCxfYj1wYXJzZUludChVLnNsaWNlKDUsNyksMTYpfHwwLF9hPU1hdGgubWluKG9lLzEwMCwxKTtyZXR1cm4iZHJvcC1zaGFkb3coIitpZSsicHggIit0ZSsicHggIitxKyJweCByZ2JhKCIrX3IrIiwiK19nKyIsIitfYisiLCIrX2ErIikpIn0oKTtmb3IodmFyIF9icD0wO19icDxNYXRoLm1heCgxLE1hdGguY2VpbChxLzE1KSk7X2JwKyspe19TLmV5ZWJyb3dDb250ZW50Vz4wJiYoSC5zYXZlKCksSC5maWx0ZXI9X3NoRk0sSC5nbG9iYWxBbHBoYT1SZS5leWVicm93Lm9wYWNpdHksSC5kcmF3SW1hZ2UoX1MuY29sb3JDYW52YXMsX1MuZXllYnJvdy54LF9TLmV5ZWJyb3cueSxfUy5leWVicm93LncsX1MuZXllYnJvdy5oLF9kc3RYLV9wYWQqX0csX2V5ZVktX3BhZCpfRyxfUy5leWVicm93LncqX0csX1MuZXllYnJvdy5oKl9HKSxILnJlc3RvcmUoKSk7SC5zYXZlKCksSC5maWx0ZXI9X3NoRk0sSC5nbG9iYWxBbHBoYT1SZS5uYW1lLm9wYWNpdHksSC5kcmF3SW1hZ2UoX1MuY29sb3JDYW52YXMsX1MubmFtZS54LF9TLm5hbWUueSxfUy5uYW1lLncsX1MubmFtZS5oLF9kc3RYLV9wYWQqX0csX25hbWVZLV9wYWQqX0csX1MubmFtZS53Kl9HLF9TLm5hbWUuaCpfRyksSC5yZXN0b3JlKCk7SC5zYXZlKCksSC5maWx0ZXI9X3NoRk0sSC5nbG9iYWxBbHBoYT1SZS50aXRsZS5vcGFjaXR5LEguZHJhd0ltYWdlKF9TLmNvbG9yQ2FudmFzLF9TLnRpdGxlLngsX1MudGl0bGUueSxfUy50aXRsZS53LF9TLnRpdGxlLmgsX2RzdFgtX3BhZCpfRyxfdGl0bGVZLV9wYWQqX0csX1MudGl0bGUudypfRyxfUy50aXRsZS5oKl9HKSxILnJlc3RvcmUoKX07X1MuZXllYnJvd0NvbnRlbnRXPjAmJihILnNhdmUoKSxILmdsb2JhbEFscGhhPVJlLmV5ZWJyb3cub3BhY2l0eSxILmRyYXdJbWFnZShfUy5jb2xvckNhbnZhcyxfUy5leWVicm93LngsX1MuZXllYnJvdy55LF9TLmV5ZWJyb3cudyxfUy5leWVicm93LmgsX2RzdFgtX3BhZCpfRyxfZXllWS1fcGFkKl9HLF9TLmV5ZWJyb3cudypfRyxfUy5leWVicm93LmgqX0cpLEgucmVzdG9yZSgpKTtILnNhdmUoKSxILmdsb2JhbEFscGhhPVJlLm5hbWUub3BhY2l0eSxILmRyYXdJbWFnZShfUy5jb2xvckNhbnZhcyxfUy5uYW1lLngsX1MubmFtZS55LF9TLm5hbWUudyxfUy5uYW1lLmgsX2RzdFgtX3BhZCpfRyxfbmFtZVktX3BhZCpfRyxfUy5uYW1lLncqX0csX1MubmFtZS5oKl9HKSxILnJlc3RvcmUoKTtILnNhdmUoKSxILmdsb2JhbEFscGhhPVJlLnRpdGxlLm9wYWNpdHksSC5kcmF3SW1hZ2UoX1MuY29sb3JDYW52YXMsX1MudGl0bGUueCxfUy50aXRsZS55LF9TLnRpdGxlLncsX1MudGl0bGUuaCxfZHN0WC1fcGFkKl9HLF90aXRsZVktX3BhZCpfRyxfUy50aXRsZS53Kl9HLF9TLnRpdGxlLmgqX0cpLEgucmVzdG9yZSgpO2lmKEQpe3ZhciBfZXVMVD1fdWxUaGljaypuYSxfZXVMTz1fdWxPZmYqbmE7SC5zaGFkb3dCbHVyPTA7SC5zaGFkb3dPZmZzZXRYPTA7SC5zaGFkb3dPZmZzZXRZPTA7aWYobil7SC5mb250PWAke290fSAke2tlfSAke2ZhKm5hfXB4ICIke2Z9Iiwgc2Fucy1zZXJpZmA7dmFyIF9lVWxXbT1ILm1lYXN1cmVUZXh0KG4pLndpZHRoLF9lVWxZbT1fZXllWStmYSpuYStfZXVMTyxfZVVsWG09X2RzdFgrKF9TLmV5ZWJyb3dMb2dvT2Zmc2V0fHwwKSpfRztILnN0cm9rZVN0eWxlPSQsSC5saW5lV2lkdGg9X2V1TFQsSC5nbG9iYWxBbHBoYT1SZS5leWVicm93Lm9wYWNpdHksSC5iZWdpblBhdGgoKSxILm1vdmVUbyhfZVVsWG0sX2VVbFltKSxILmxpbmVUbyhfZVVsWG0rX2VVbFdtLF9lVWxZbSksSC5zdHJva2UoKTtHLnN0cm9rZVN0eWxlPSIjRkZGRkZGIixHLmZvbnQ9YCR7b3R9ICR7a2V9ICR7ZmEqbmF9cHggIiR7Zn0iLCBzYW5zLXNlcmlmYCxHLmxpbmVXaWR0aD1fZXVMVCxHLmdsb2JhbEFscGhhPVJlLmV5ZWJyb3cub3BhY2l0eSxHLmJlZ2luUGF0aCgpLEcubW92ZVRvKF9lVWxYbSxfZVVsWW0pLEcubGluZVRvKF9lVWxYbStfZVVsV20sX2VVbFltKSxHLnN0cm9rZSgpfUguZm9udD1gJHtvdH0gJHtrZX0gJHtGbipuYX1weCAiJHtmfSIsIHNhbnMtc2VyaWZgO3ZhciBfblVsVz1ILm1lYXN1cmVUZXh0KGwpLndpZHRoLF9uVWxZPXFhK0ZuKm5hK19ldUxPO0guc3Ryb2tlU3R5bGU9JCxILmxpbmVXaWR0aD1fZXVMVCxILmdsb2JhbEFscGhhPVJlLm5hbWUub3BhY2l0eSxILmJlZ2luUGF0aCgpLEgubW92ZVRvKF9kc3RYLF9uVWxZKSxILmxpbmVUbyhfZHN0WCtfblVsVyxfblVsWSksSC5zdHJva2UoKTtILmZvbnQ9YCR7b3R9ICR7WGV9ICR7Qm4qbmF9cHggIiR7Zn0iLCBzYW5zLXNlcmlmYDt2YXIgX3RVbFc9SC5tZWFzdXJlVGV4dChjKS53aWR0aCxfdFVsWT1fdGl0bGVZK0JuKm5hK19ldUxPO0gubGluZVdpZHRoPV9ldUxULEguZ2xvYmFsQWxwaGE9UmUudGl0bGUub3BhY2l0eSxILmJlZ2luUGF0aCgpLEgubW92ZVRvKF9kc3RYLF90VWxZKSxILmxpbmVUbyhfZHN0WCtfdFVsVyxfdFVsWSksSC5zdHJva2UoKTtHLnN0cm9rZVN0eWxlPSIjRkZGRkZGIixHLmZvbnQ9YCR7b3R9ICR7a2V9ICR7Rm4qbmF9cHggIiR7Zn0iLCBzYW5zLXNlcmlmYCxHLmxpbmVXaWR0aD1fZXVMVCxHLmdsb2JhbEFscGhhPVJlLm5hbWUub3BhY2l0eSxHLmJlZ2luUGF0aCgpLEcubW92ZVRvKF9kc3RYLF9uVWxZKSxHLmxpbmVUbyhfZHN0WCtfblVsVyxfblVsWSksRy5zdHJva2UoKTtHLmZvbnQ9YCR7b3R9ICR7WGV9ICR7Qm4qbmF9cHggIiR7Zn0iLCBzYW5zLXNlcmlmYCxHLmxpbmVXaWR0aD1fZXVMVCxHLmdsb2JhbEFscGhhPVJlLnRpdGxlLm9wYWNpdHksRy5iZWdpblBhdGgoKSxHLm1vdmVUbyhfZHN0WCxfdFVsWSksRy5saW5lVG8oX2RzdFgrX3RVbFcsX3RVbFkpLEcuc3Ryb2tlKCk7SC5nbG9iYWxBbHBoYT0xLEcuZ2xvYmFsQWxwaGE9MTtILnNoYWRvd0JsdXI9MDtILnNoYWRvd09mZnNldFg9MDtILnNoYWRvd09mZnNldFk9MH19ZWxzZXtfUy5leWVicm93Q29udGVudFc+MCYmKEguc2F2ZSgpLEguZ2xvYmFsQWxwaGE9UmUuZXllYnJvdy5vcGFjaXR5LEguZHJhd0ltYWdlKF9TLmNvbG9yQ2FudmFzLF9TLmV5ZWJyb3cueCxfUy5leWVicm93LnksX1MuZXllYnJvdy53LF9TLmV5ZWJyb3cuaCxfZHN0WC1fcGFkKl9HLF9leWVZLV9wYWQqX0csX1MuZXllYnJvdy53Kl9HLF9TLmV5ZWJyb3cuaCpfRyksSC5yZXN0b3JlKCkpO0guc2F2ZSgpLEguZ2xvYmFsQWxwaGE9UmUubmFtZS5vcGFjaXR5LEguZHJhd0ltYWdlKF9TLmNvbG9yQ2FudmFzLF9TLm5hbWUueCxfUy5uYW1lLnksX1MubmFtZS53LF9TLm5hbWUuaCxfZHN0WC1fcGFkKl9HLF9uYW1lWS1fcGFkKl9HLF9TLm5hbWUudypfRyxfUy5uYW1lLmgqX0cpLEgucmVzdG9yZSgpO0guc2F2ZSgpLEguZ2xvYmFsQWxwaGE9UmUudGl0bGUub3BhY2l0eSxILmRyYXdJbWFnZShfUy5jb2xvckNhbnZhcyxfUy50aXRsZS54LF9TLnRpdGxlLnksX1MudGl0bGUudyxfUy50aXRsZS5oLF9kc3RYLV9wYWQqX0csX3RpdGxlWS1fcGFkKl9HLF9TLnRpdGxlLncqX0csX1MudGl0bGUuaCpfRyksSC5yZXN0b3JlKCl9";
const EDIT_OLD = Buffer.from(EDIT_OLD_B64, "base64").toString("utf8");

const EDIT_NEW =
  '{' +
  // Build temp canvas (destination-sized)
  'const _mtEyTC=document.createElement("canvas");' +
  '_mtEyTC.width=H.canvas.width;_mtEyTC.height=H.canvas.height;' +
  'const _mtEyCtx=_mtEyTC.getContext("2d");' +
  '_mtEyCtx.textBaseline="top";_mtEyCtx.lineJoin="round";_mtEyCtx.lineCap="round";' +
  // Draw factory color regions onto temp
  '_S.eyebrowContentW>0&&(_mtEyCtx.save(),_mtEyCtx.globalAlpha=Re.eyebrow.opacity,_mtEyCtx.drawImage(_S.colorCanvas,_S.eyebrow.x,_S.eyebrow.y,_S.eyebrow.w,_S.eyebrow.h,_dstX-_pad*_G,_eyeY-_pad*_G,_S.eyebrow.w*_G,_S.eyebrow.h*_G),_mtEyCtx.restore());' +
  '_mtEyCtx.save(),_mtEyCtx.globalAlpha=Re.name.opacity,_mtEyCtx.drawImage(_S.colorCanvas,_S.name.x,_S.name.y,_S.name.w,_S.name.h,_dstX-_pad*_G,_nameY-_pad*_G,_S.name.w*_G,_S.name.h*_G),_mtEyCtx.restore();' +
  '_mtEyCtx.save(),_mtEyCtx.globalAlpha=Re.title.opacity,_mtEyCtx.drawImage(_S.colorCanvas,_S.title.x,_S.title.y,_S.title.w,_S.title.h,_dstX-_pad*_G,_titleY-_pad*_G,_S.title.w*_G,_S.title.h*_G),_mtEyCtx.restore();' +
  // Underline strokes on temp + G
  'if(D){' +
    'var _euLT=_ulThick*na,_euLO=_ulOff*na;' +
    '_mtEyCtx.lineWidth=_euLT;_mtEyCtx.strokeStyle=$;' +
    'G.strokeStyle="#FFFFFF";G.lineWidth=_euLT;' +
    'if(n){' +
      '_mtEyCtx.font=`${ot} ${ke} ${fa*na}px "${f}", sans-serif`;' +
      'G.font=_mtEyCtx.font;' +
      'var _eUlWm=_mtEyCtx.measureText(n).width;' +
      'var _eUlYm=_eyeY+fa*na+_euLO;' +
      'var _eUlXm=_dstX+(_S.eyebrowLogoOffset||0)*_G;' +
      '_mtEyCtx.globalAlpha=Re.eyebrow.opacity;' +
      '_mtEyCtx.beginPath();_mtEyCtx.moveTo(_eUlXm,_eUlYm);_mtEyCtx.lineTo(_eUlXm+_eUlWm,_eUlYm);_mtEyCtx.stroke();' +
      'G.globalAlpha=Re.eyebrow.opacity;' +
      'G.beginPath();G.moveTo(_eUlXm,_eUlYm);G.lineTo(_eUlXm+_eUlWm,_eUlYm);G.stroke();' +
    '}' +
    '_mtEyCtx.font=`${ot} ${ke} ${Fn*na}px "${f}", sans-serif`;' +
    'G.font=_mtEyCtx.font;' +
    'var _nUlW=_mtEyCtx.measureText(l).width;' +
    'var _nUlY=qa+Fn*na+_euLO;' +
    '_mtEyCtx.globalAlpha=Re.name.opacity;' +
    '_mtEyCtx.beginPath();_mtEyCtx.moveTo(_dstX,_nUlY);_mtEyCtx.lineTo(_dstX+_nUlW,_nUlY);_mtEyCtx.stroke();' +
    'G.globalAlpha=Re.name.opacity;' +
    'G.beginPath();G.moveTo(_dstX,_nUlY);G.lineTo(_dstX+_nUlW,_nUlY);G.stroke();' +
    '_mtEyCtx.font=`${ot} ${Xe} ${Bn*na}px "${f}", sans-serif`;' +
    'G.font=_mtEyCtx.font;' +
    'var _tUlW=_mtEyCtx.measureText(c).width;' +
    'var _tUlY=_titleY+Bn*na+_euLO;' +
    '_mtEyCtx.globalAlpha=Re.title.opacity;' +
    '_mtEyCtx.beginPath();_mtEyCtx.moveTo(_dstX,_tUlY);_mtEyCtx.lineTo(_dstX+_tUlW,_tUlY);_mtEyCtx.stroke();' +
    'G.globalAlpha=Re.title.opacity;' +
    'G.beginPath();G.moveTo(_dstX,_tUlY);G.lineTo(_dstX+_tUlW,_tUlY);G.stroke();' +
  '}' +
  // Build drop-shadow filter
  'var _shFM=z?function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}():"none";' +
  // Shadow loop on H
  'for(var _bp=0;_bp<(z?Math.max(1,Math.ceil(q/15)):0);_bp++){' +
    'H.save();H.filter=_shFM;H.globalAlpha=1;H.drawImage(_mtEyTC,0,0);H.restore();' +
  '}' +
  // Visible draw on H
  'H.save();H.globalAlpha=1;H.drawImage(_mtEyTC,0,0);H.restore();' +
  'H.globalAlpha=1;G.globalAlpha=1;' +
  '}';

const MARKER = '_mtEyTC=document.createElement("canvas")';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-edit-ye-meta-unified-shadow] already applied");
    return;
  }

  const n = src.split(EDIT_OLD).length - 1;
  if (n === 0) {
    console.error("[patch-edit-ye-meta-unified-shadow] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-ye-meta-unified-shadow] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(EDIT_OLD, EDIT_NEW);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-ye-meta-unified-shadow] OK — Edit Ye Meta now uses temp-canvas unified shadow");
}
main();
