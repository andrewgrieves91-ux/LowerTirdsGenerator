/*
 * patch-tc-replace-dse.cjs
 *
 * Tc uses a `_dse` helper that does:
 *   ctx.save(); ctx.globalAlpha=a; ctx.translate(dx,dy); ctx.scale(Q,Q);
 *   ctx.drawImage(cv, r.x,r.y,r.w,r.h, 0,0, r.w,r.h); ctx.restore();
 *
 * Mathematically equivalent to:
 *   ctx.save(); ctx.globalAlpha=a;
 *   ctx.drawImage(cv, r.x,r.y,r.w,r.h, dx,dy, r.w*Q,r.h*Q);
 *   ctx.restore();
 *
 * Kt and Ye use the second form (raw drawImage with explicit dst dims).
 * Browsers can produce sub-pixel different results between the two when
 * `imageSmoothingQuality:"high"` is set. Aligning Tc to Kt/Ye removes
 * that source of drift.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Eyebrow: U.eyebrow.w>0 && _dse(_mtCtx,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);
const EYE_OLD = "U.eyebrow.w>0&&_dse(_mtCtx,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);";
const EYE_NEW = "U.eyebrow.w>0&&(_mtCtx.save(),_mtCtx.globalAlpha=D.opacity,_mtCtx.drawImage(_srcC,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,_eXe-_dp*Q,zt-_dp*Q,U.eyebrow.w*Q,U.eyebrow.h*Q),_mtCtx.restore());";

// Name: _dse(_mtCtx,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);
const NAME_OLD = "_dse(_mtCtx,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);";
const NAME_NEW = "_mtCtx.save();_mtCtx.globalAlpha=B.opacity;_mtCtx.drawImage(_srcC,U.name.x,U.name.y,U.name.w,U.name.h,_nXe-_dp*Q,Qe-_dp*Q,U.name.w*Q,U.name.h*Q);_mtCtx.restore();";

// Title: _dse(_mtCtx,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);
const TITLE_OLD = "_dse(_mtCtx,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);";
const TITLE_NEW = "_mtCtx.save();_mtCtx.globalAlpha=k.opacity;_mtCtx.drawImage(_srcC,U.title.x,U.title.y,U.title.w,U.title.h,_tXe-_dp*Q,$e-_dp*Q,U.title.w*Q,U.title.h*Q);_mtCtx.restore();";

const MARKER = "_mtCtx.drawImage(_srcC,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,_eXe-_dp*Q,zt-_dp*Q,U.eyebrow.w*Q,U.eyebrow.h*Q)";

function applyOnce(src, oldStr, newStr, label) {
  const n = src.split(oldStr).length - 1;
  if (n === 0) {
    console.error(`[patch-tc-replace-dse] ${label} not found`);
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-tc-replace-dse] ${label} not unique (${n})`);
    process.exit(1);
  }
  return src.replace(oldStr, newStr);
}

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(MARKER)) {
    console.log("[patch-tc-replace-dse] already applied");
    return;
  }
  src = applyOnce(src, EYE_OLD, EYE_NEW, "eyebrow");
  src = applyOnce(src, NAME_OLD, NAME_NEW, "name");
  src = applyOnce(src, TITLE_OLD, TITLE_NEW, "title");
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-tc-replace-dse] OK — Tc replaces _dse with raw drawImage to match Kt/Ye");
}
main();
