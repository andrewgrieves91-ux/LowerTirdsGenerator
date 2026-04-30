/*
 * patch-edit-nonmeta-tempcanvas-shadow.cjs
 *
 * Proper non-Meta shadow render for the Edit page: pre-render
 * eyebrow + logo + name + title (with their borders) into an
 * off-screen temp canvas, then `drawImage` THAT canvas onto the
 * destination context `H` with the drop-shadow CSS filter.
 *
 * Why this works:
 *   - Drop-shadow operates on the SOURCE's combined alpha mask. By
 *     painting fill+border on the temp first, the alpha mask is
 *     the union of fill and border outlines. The shadow halo is
 *     cast around that combined OUTER outline — exactly what Meta's
 *     factory-based render produces.
 *   - Each shadow-loop iteration just `drawImage`s the temp with
 *     filter applied. There's no separate stroke/fill call, so no
 *     fill_shadow gets stacked on top of an already-drawn border
 *     and there's no per-element interference. Border stays clean
 *     on top, with its shadow underneath.
 *   - The visible pass after the loop is a single `drawImage` of
 *     the same temp without filter, which reproduces the original
 *     fillText/strokeText output identically.
 *
 * Performance note: a 1920×1080 canvas is created per Ye() frame
 * inside the `if(z){...}` block. Edit page renders on demand, so
 * this is fine. If a future profile shows it as a bottleneck, the
 * temp canvas can be hoisted to a closure-scoped lazy ref.
 *
 * The replacement preserves:
 *   - Outer `H.save()` / `H.restore()` boundary
 *   - The same H state setup (textBaseline, lineJoin, lineCap, fillStyle)
 *   - Conditional eyebrow text (`if(n)`), logo (`if(_lI)`)
 *   - Per-element opacity (Re.eyebrow/name/title)
 *   - All position vars (Ee/St, ia/ha, Ct/Dt) and font strings (jn/Gn/Xa)
 *   - The drop-shadow filter `_shFNM` and iteration count formula
 *   - `we` / `He` / `Ce` for borderEnabled / Color / Width
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

const OLD =
  'if(z){H.save();H.textBaseline="top";H.lineJoin="round";H.lineCap="round";H.fillStyle=$;' +
  'for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){' +
    'H.filter=_shFNM;' +
    'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillText(n,Ee,St)}' +
    'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}' +
    'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillText(l,ia,ha);' +
    'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillText(c,Ct,Dt)' +
  '}' +
  'H.filter="none";' +
  'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillText(n,Ee,St)}' +
  'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}' +
  'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillText(l,ia,ha);' +
  'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillText(c,Ct,Dt);' +
  'H.globalAlpha=1;H.restore()}';

const NEW =
  'if(z){H.save();H.textBaseline="top";H.lineJoin="round";H.lineCap="round";H.fillStyle=$;' +
  // Build the temp canvas with fill+border baked in.
  'const _shTC=document.createElement("canvas");' +
  '_shTC.width=H.canvas.width;_shTC.height=H.canvas.height;' +
  'const _shTctx=_shTC.getContext("2d");' +
  '_shTctx.textBaseline="top";_shTctx.lineJoin="round";_shTctx.lineCap="round";' +
  '_shTctx.fillStyle=$;_shTctx.strokeStyle=He;_shTctx.lineWidth=Ce;' +
  'if(n){_shTctx.font=jn;_shTctx.globalAlpha=Re.eyebrow.opacity;' +
    'we&&_shTctx.strokeText(n,Ee,St);_shTctx.fillText(n,Ee,St)}' +
  'if(_lI){_shTctx.globalAlpha=Re.eyebrow.opacity;_shTctx.drawImage(_lI,_lDX,_lTY,_lW,_lH)}' +
  '_shTctx.font=Gn;_shTctx.globalAlpha=Re.name.opacity;' +
    'we&&_shTctx.strokeText(l,ia,ha);_shTctx.fillText(l,ia,ha);' +
  '_shTctx.font=Xa;_shTctx.globalAlpha=Re.title.opacity;' +
    'we&&_shTctx.strokeText(c,Ct,Dt);_shTctx.fillText(c,Ct,Dt);' +
  // Shadow loop: drawImage with drop-shadow filter N times.
  'for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){' +
    'H.filter=_shFNM;H.globalAlpha=1;H.drawImage(_shTC,0,0)' +
  '}' +
  // Visible pass: same temp canvas without filter.
  'H.filter="none";H.globalAlpha=1;H.drawImage(_shTC,0,0);' +
  'H.restore()}';

// Idempotency marker — `_shTC=document.createElement("canvas")` is unique
// to the post-patch state.
const MARKER = '_shTC=document.createElement("canvas")';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-edit-nonmeta-tempcanvas-shadow] already applied");
    return;
  }

  const n = src.split(OLD).length - 1;
  if (n === 0) {
    console.error("[patch-edit-nonmeta-tempcanvas-shadow] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-nonmeta-tempcanvas-shadow] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(OLD, NEW);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(
    "[patch-edit-nonmeta-tempcanvas-shadow] OK — Edit non-Meta now uses combined fill+border temp canvas for drop-shadow"
  );
}
main();
