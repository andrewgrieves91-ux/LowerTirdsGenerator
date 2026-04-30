/*
 * patch-edit-nonmeta-tempcanvas-add-underlines.cjs
 *
 * Edit page non-Meta: the previous tempcanvas-shadow patch builds a
 * temp canvas with text+border, then drawImage's it onto H with the
 * drop-shadow filter. The shadow halo is computed from the temp's
 * alpha mask — and that mask did NOT include the underline shapes,
 * so the halo extended downward into the underline strip and
 * overlaid the underlines drawn earlier in the section blocks.
 *
 * Fix: also render the three underline strokes (eyebrow + name +
 * title) onto the temp canvas right after the title fillText.
 * Now the temp's combined alpha mask is (text + border + underline),
 * the shadow halo wraps around the OUTER outline of all three
 * together, and the underline pixels — being INSIDE the combined
 * mask — never get covered by the halo.
 *
 * Variables in scope at the if(z){} block:
 *   - n, l, c                    text strings (eyebrow, name, title)
 *   - jn, Gn, Xa                 font strings
 *   - fa, Fn, Bn                 font sizes
 *   - $                          config.color
 *   - Ee, St, ia, ha, Ct, Dt     positions (set by sections)
 *   - D                          underlineEnabled
 *   - _ulThick, _ulOff           underline thickness + Y offset
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Anchor: end of title fillText on temp ctx, right before the shadow loop.
const OLD =
  "_shTctx.font=Xa;_shTctx.globalAlpha=Re.title.opacity;" +
    "we&&_shTctx.strokeText(c,Ct,Dt);_shTctx.fillText(c,Ct,Dt);" +
  "for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){";

const NEW =
  "_shTctx.font=Xa;_shTctx.globalAlpha=Re.title.opacity;" +
    "we&&_shTctx.strokeText(c,Ct,Dt);_shTctx.fillText(c,Ct,Dt);" +
  // Underlines on temp — same coords/font as the section's eyebrow/name/title,
  // so the temp's combined alpha mask now includes them.
  "if(D){" +
    "_shTctx.strokeStyle=$;_shTctx.lineWidth=_ulThick;_shTctx.globalAlpha=1;" +
    "if(n){" +
      "_shTctx.font=jn;" +
      "var _ne_eUlW=_shTctx.measureText(n).width," +
          "_ne_eUlY=St+fa+_ulOff;" +
      "_shTctx.beginPath();" +
      "_shTctx.moveTo(Ee,_ne_eUlY);" +
      "_shTctx.lineTo(Ee+_ne_eUlW,_ne_eUlY);" +
      "_shTctx.stroke();" +
    "}" +
    "_shTctx.font=Gn;" +
    "var _ne_nUlW=_shTctx.measureText(l).width," +
        "_ne_nUlY=ha+Fn+_ulOff;" +
    "_shTctx.beginPath();" +
    "_shTctx.moveTo(ia,_ne_nUlY);" +
    "_shTctx.lineTo(ia+_ne_nUlW,_ne_nUlY);" +
    "_shTctx.stroke();" +
    "_shTctx.font=Xa;" +
    "var _ne_tUlW=_shTctx.measureText(c).width," +
        "_ne_tUlY=Dt+Bn+_ulOff;" +
    "_shTctx.beginPath();" +
    "_shTctx.moveTo(Ct,_ne_tUlY);" +
    "_shTctx.lineTo(Ct+_ne_tUlW,_ne_tUlY);" +
    "_shTctx.stroke();" +
  "}" +
  "for(var _bp=0;_bp<Math.max(1,Math.ceil(q/15));_bp++){";

const MARKER = "var _ne_eUlW=_shTctx.measureText(n).width";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-edit-nonmeta-tempcanvas-add-underlines] already applied");
    return;
  }

  const n = src.split(OLD).length - 1;
  if (n === 0) {
    console.error("[patch-edit-nonmeta-tempcanvas-add-underlines] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-nonmeta-tempcanvas-add-underlines] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(OLD, NEW);

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-nonmeta-tempcanvas-add-underlines] OK — underlines now baked into temp canvas alpha mask");
}
main();
