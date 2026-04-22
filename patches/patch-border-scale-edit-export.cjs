/*
 * patch-border-scale-edit-export.cjs
 *
 * Extends patch-border-scale.cjs (which fixed Live's K() factory) to the
 * Edit and Export offscreen factories. Both have the same bug: the border
 * stroke uses the raw config value on a max-scale-rendered bitmap, so when
 * the bitmap is scaled down at draw time the border shows thinner than
 * configured.
 *
 * Changes:
 *
 *   Edit factory `xR()` (byte ~567761):
 *     Parameter `_` is the border width. Scales the parameter by the
 *     factory's max-scale factor `_XRS` by inserting `_=_*_XRS;` right
 *     after `_XRS` is declared. This cascades to every `Le.lineWidth=_`
 *     and `Ae.lineWidth=_` site and the `ee=b?Math.ceil(_/2)+2:0`
 *     region-padding calc so all downstream uses see the scaled value.
 *
 *   Export factory `_c()` (byte ~645440):
 *     Changes the two borderWidth declarations so both the stroke width
 *     and the region-padding calc scale by `_RS`:
 *       `Ie = i.borderWidth||2`         → `(i.borderWidth||2)*_RS`
 *       `ue = ... i.borderWidth||2 :0`  → `... (i.borderWidth||2)*_RS :0`
 *
 * For non-Meta animations both `_XRS` and `_RS` equal 1, so borders on
 * slides/fades are unchanged. For Meta, they equal 1.121 (Live/Export) or
 * 4 (Edit preview, which renders at 4× for extra crispness) and the
 * border now matches the configured px width on-screen.
 *
 * Idempotent.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(
  __dirname, "..", "dist", "public", "assets", "index-iitzneuS.js",
);

const REPLACEMENTS = [
  {
    label: "xR() edit factory: scale _ by _XRS",
    old: "function xR(r,n,a,l,i,c,u,f,m,p,v,x,b,E,_,w,T,_xms,_szp,_szc){const _XRS=_xms||1.121;",
    new: "function xR(r,n,a,l,i,c,u,f,m,p,v,x,b,E,_,w,T,_xms,_szp,_szc){const _XRS=_xms||1.121;_=_*_XRS;",
    applied_marker: "const _XRS=_xms||1.121;_=_*_XRS;",
  },
  {
    label: "_c() export factory: scale Ie (stroke width) by _RS",
    old: 'const Ce=i.borderColor||"#000000",Ie=i.borderWidth||2;',
    new: 'const Ce=i.borderColor||"#000000",Ie=(i.borderWidth||2)*_RS;',
    applied_marker: 'Ie=(i.borderWidth||2)*_RS',
  },
  {
    label: "_c() export factory: scale ue (region padding) by _RS",
    old: "ue=i.borderEnabled?i.borderWidth||2:0,he=ue>0?Math.ceil(ue/2)+2:0",
    new: "ue=i.borderEnabled?(i.borderWidth||2)*_RS:0,he=ue>0?Math.ceil(ue/2)+2:0",
    applied_marker: "ue=i.borderEnabled?(i.borderWidth||2)*_RS:0",
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  let src = fs.readFileSync(BUNDLE, "utf8");
  let changed = false;
  for (const { label, old, new: next, applied_marker } of REPLACEMENTS) {
    if (src.includes(applied_marker)) {
      console.log(`[patch-border-scale-edit-export] ${label}: already applied`);
      continue;
    }
    const n = src.split(old).length - 1;
    if (n === 0) {
      console.error(`[patch-border-scale-edit-export] ${label}: target not found — aborting`);
      process.exit(1);
    }
    if (n > 1) {
      console.error(`[patch-border-scale-edit-export] ${label}: target found ${n}x — aborting ambiguous`);
      process.exit(1);
    }
    src = src.replace(old, next);
    changed = true;
    console.log(`[patch-border-scale-edit-export] ${label}: applied`);
  }
  if (!changed) { console.log("[patch-border-scale-edit-export] already fully applied."); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-border-scale-edit-export] OK");
}
main();
