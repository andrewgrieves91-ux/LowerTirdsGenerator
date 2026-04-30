/*
 * patch-disable-underline-shadow.cjs
 *
 * After moving the underline to the topmost layer (above visible text
 * + border), the underline's own drop-shadow now sits on top of the
 * letters and the border because they are drawn first. To stop the
 * stacking conflict the simplest fix is to drop the shadow on the
 * underline strokes entirely — the underline still renders on top
 * but it doesn't paint a halo into the text region.
 *
 * In each of the 3 Meta-path underline blocks (Live `Kt`, Edit `Ye`
 * Meta, Tc Meta) we replace the conditional `if(<shadowEnabled>){<set
 * shadow*>}else{<reset>}` with just the reset. After that the
 * subsequent stroke calls run with `shadow*=0`.
 *
 * If the user later asks for underline shadow back, the proper fix
 * is to bake the underline strokes into the factory's `colorCanvas`
 * + `alphaCanvas`. That gives a single combined-mask drop-shadow
 * halo wrapping around the OUTER outline of (text+border+underline)
 * with no internal stacking. Deferred for now.
 *
 * Idempotent. Atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const REPLACEMENTS = [
  {
    label: "Tc Meta underline shadow setup",
    oldStr:
      'if(p.shadowEnabled){' +
        'var _tSC=p.shadowColor??"#000000",' +
            '_tSR=parseInt(_tSC.slice(1,3),16)||0,' +
            '_tSG=parseInt(_tSC.slice(3,5),16)||0,' +
            '_tSB=parseInt(_tSC.slice(5,7),16)||0,' +
            '_tSA=Math.min((p.shadowStrength??100)/100,1);' +
        'n.shadowBlur=(p.shadowBlur??10)*b;' +
        'n.shadowOffsetX=(p.shadowOffsetX??0)*b;' +
        'n.shadowOffsetY=(p.shadowOffsetY??0)*b;' +
        'n.shadowColor="rgba("+_tSR+","+_tSG+","+_tSB+","+_tSA+")"' +
      '}else{' +
        'n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0' +
      '}',
    // Trailing `;` so the following `if(R)` (or whatever next statement) is
    // separated from this expression sequence.
    newStr: 'n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0;',
  },
  {
    label: "Edit Ye Meta underline shadow setup",
    oldStr:
      'if(z){' +
        'var _euC=U,' +
            '_euR=parseInt(_euC.slice(1,3),16)||0,' +
            '_euG=parseInt(_euC.slice(3,5),16)||0,' +
            '_euB=parseInt(_euC.slice(5,7),16)||0,' +
            '_euA=Math.min(oe/100,1);' +
        'H.shadowBlur=q;' +
        'H.shadowOffsetX=ie;' +
        'H.shadowOffsetY=te;' +
        'H.shadowColor="rgba("+_euR+","+_euG+","+_euB+","+_euA+")"' +
      '}else{' +
        'H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0' +
      '}',
    // Trailing `;` so following `if(n)` starts a new statement cleanly
    // (the original `}` of the else block was the separator before).
    newStr: 'H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0;',
  },
  // Live Kt has TWO identical underline shadow IIFEs (one for eyebrow,
  // one for name/title). Same exact text — handle as replace_all-style.
  {
    label: "Live Kt underline shadow IIFEs (both eyebrow + name/title)",
    oldStr:
      '(function(){' +
        'if(_e.config.shadowEnabled){' +
          'var _c=_e.config.shadowColor??"#000000";' +
          'W.shadowBlur=_e.config.shadowBlur??10;' +
          'W.shadowOffsetX=_e.config.shadowOffsetX??0;' +
          'W.shadowOffsetY=_e.config.shadowOffsetY??0;' +
          'W.shadowColor="rgba("+(parseInt(_c.slice(1,3),16)||0)+","+(parseInt(_c.slice(3,5),16)||0)+","+(parseInt(_c.slice(5,7),16)||0)+","+Math.min((_e.config.shadowStrength??100)/100,1)+")"' +
        '}else{' +
          'W.shadowBlur=0;W.shadowOffsetX=0;W.shadowOffsetY=0' +
        '}' +
      '})()',
    newStr: '(function(){W.shadowBlur=0;W.shadowOffsetX=0;W.shadowOffsetY=0})()',
    replaceAll: true,
  },
];

const MARKER = "[UNDERLINE-SHADOW-DISABLED-MARKER-V1]"; // unused — using count-based check instead

function applyOnce(src, label, oldStr, newStr, replaceAll = false) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    // Maybe already applied — verify the new text is present.
    if (src.includes(newStr)) {
      console.log(`[patch-disable-underline-shadow] ${label}: already applied`);
      return src;
    }
    console.error(`[patch-disable-underline-shadow] ${label}: anchor not found`);
    process.exit(1);
  }
  if (!replaceAll && n !== 1) {
    console.error(`[patch-disable-underline-shadow] ${label}: anchor not unique (${n}) — set replaceAll if intentional`);
    process.exit(1);
  }
  // Use a global replace via split/join when replaceAll is set.
  src = replaceAll ? src.split(oldStr).join(newStr) : src.replace(oldStr, newStr);
  console.log(`[patch-disable-underline-shadow] ${label}: shadow setup removed (${n} sites)`);
  return src;
}

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  for (const r of REPLACEMENTS) {
    src = applyOnce(src, r.label, r.oldStr, r.newStr, r.replaceAll || false);
  }

  if (src === original) {
    console.log("[patch-disable-underline-shadow] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-disable-underline-shadow] OK");
}
main();
