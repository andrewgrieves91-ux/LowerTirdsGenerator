/*
 * patch-edit-factory-canvas-size.cjs
 *
 * Edit's xR factory was being called with `_xms = (At==="meta"?4:1)`,
 * meaning its output `colorCanvas` and `alphaCanvas` were rasterized
 * at 4x for Meta. Live `K()` rasterizes at 1.121x. Same logical size
 * after composition, but VERY different anti-aliasing edges because
 * 4x→1x downsample produces sharper glyph edges than 1.121x→1x.
 *
 * Aligns Edit to Live by changing the call site to pass 1.121 for
 * meta. Edit preview will pick up Live's anti-aliasing exactly.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const OLD = '?xR(l,c,n,f,p,x,E,w,C,k,N??"",$,we,He,Ce,Ae.current,dt,At==="meta"?4:1,0,U)';
const NEW = '?xR(l,c,n,f,p,x,E,w,C,k,N??"",$,we,He,Ce,Ae.current,dt,At==="meta"?1.121:1,0,U)';

function main() {
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;
  if (src.includes(NEW)) {
    console.log("[patch-edit-factory-canvas-size] already applied");
    return;
  }
  const n = src.split(OLD).length - 1;
  if (n === 0) {
    console.error("[patch-edit-factory-canvas-size] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-factory-canvas-size] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(OLD, NEW);
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-factory-canvas-size] OK — Edit now uses 1.121x maxScale (matches Live)");
}
main();
