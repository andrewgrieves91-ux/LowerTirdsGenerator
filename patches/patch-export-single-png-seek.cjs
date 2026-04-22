/*
 * patch-export-single-png-seek.cjs  (Tier B2)
 *
 * Replaces the wall-clock `setTimeout(anim + 100ms)` in the single-PNG
 * export with an instantaneous `seekTo(…)` on the GSAP timeline.
 *
 * Before: when the user clicked "Export PNG", the code would literally
 * sleep for `animDur + 100 ms` of wall-clock time before capturing the
 * canvas. With a 5s animate-in that's 5 seconds of waiting for every
 * exported PNG. The values captured were also inherently non-deterministic
 * because they depended on whatever the running timeline happened to
 * reach by that wall-clock moment.
 *
 * After: we `seekTo((animDur + 100) / 1000)` on the paused timeline —
 * same conceptual moment (100 ms into the dwell phase, so text is at
 * its final visible state) — but immediately and frame-accurate. Export
 * completes as fast as `canvas.toBlob("image/png")` can encode.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OLD = 'await new Promise(xt=>{setTimeout(()=>{const At=Je.getValues();Tc(Ce,Le,oe,le,At,u?"rgba(0,0,0,0)":_,!1,M.current,Pt),Je.stop(),dt.toBlob(async at=>{at&&(await ve(at,zt,"image/png")||z(Ce.id,{status:"error",error:"Cancelled"})),xt()},"image/png")},Ie+100)})';
const NEW = 'Je.seekTo((Ie+100)/1000),await new Promise(xt=>{const At=Je.getValues();Tc(Ce,Le,oe,le,At,u?"rgba(0,0,0,0)":_,!1,M.current,Pt),Je.stop(),dt.toBlob(async at=>{at&&(await ve(at,zt,"image/png")||z(Ce.id,{status:"error",error:"Cancelled"})),xt()},"image/png")})';
const MARKER = 'Je.seekTo((Ie+100)/1000)';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-single-png-seek] already applied"); return; }
  const n = src.split(OLD).length - 1;
  if (n !== 1) { console.error(`[patch-export-single-png-seek] expected 1 target, found ${n}`); process.exit(1); }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-single-png-seek] OK — single-PNG export is now seek-based, not wall-clock");
}
main();
