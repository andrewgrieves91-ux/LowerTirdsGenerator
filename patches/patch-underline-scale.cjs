/*
 * patch-underline-scale.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Fix for: the underline drawn under Meta-animation text did not scale
 * with the text. Meta grows text from 1.0× → 1.121× via `drawImage` of a
 * pre-rendered offscreen bitmap, but the underline was drawn fresh each
 * frame on the live canvas using BASE font sizes, so it stayed the same
 * length and the same pixel distance from the baseline while the text
 * grew — visibly detached.
 *
 * Approach:
 *   Modify the existing per-frame underline drawing in the Kt render
 *   loop to use the current animation scale factor `tr`
 *   (`tr = Yn ? It.scale : 1`, i.e. the GSAP-driven scale for Meta,
 *   identity 1 for all other animation types). Every linear dimension
 *   gets multiplied by `tr`:
 *     - underline thickness
 *     - underline Y offset below baseline
 *     - font size used for `measureText` (so the underline width tracks
 *       the on-screen text width at the current scale)
 *     - the distance from text top to underline baseline
 *
 * Why not bake it into the offscreen bitmap: the bitmap is what the
 * drop-shadow filter casts its shadow from. If the underline were baked
 * in, the shadow would cast from underline+text together, producing a
 * shadow-of-underline streak underneath the underline. By keeping the
 * underline as a separate pass drawn AFTER the shadow pass in the render
 * loop, the underline sits cleanly on top of shadows with no shadow cast
 * from the underline itself — which is what the operator wants.
 *
 * Side effect on non-Meta animations: `tr === 1` so all multiplications
 * are identity — slide/fade/etc. render underlines exactly as before.
 *
 * Idempotent: re-running is a no-op if already applied.
 * Rollback: `git checkout -- dist/public/assets/index-iitzneuS.js`
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BUNDLE = path.resolve(
  __dirname,
  "..",
  "dist",
  "public",
  "assets",
  "index-iitzneuS.js",
);

// -----------------------------------------------------------------------------
// Original underline block in Kt render loop (base-size positioning)
// -----------------------------------------------------------------------------
const OLD =
  'if(_e.config.underline){' +
    'var _lUlT=_e.config.underlineThickness??2,_lUlO=_e.config.underlineOffset??2;' +
    'if(xn){' +
      'W.font=gn;' +
      'const _ew=W.measureText(xn).width,_euy=_Fn+os+_lUlO;' +
      'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
      'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=pn.opacity,' +
      'W.beginPath(),W.moveTo(Oe,_euy),W.lineTo(Oe+_ew,_euy),W.stroke();' +
      'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=pn.opacity,' +
      'me.beginPath(),me.moveTo(Oe,_euy),me.lineTo(Oe+_ew,_euy),me.stroke()' +
    '}' +
    'W.font=La;const _nw=W.measureText(_e.config.name).width;' +
    'W.font=Ca;const _tw=W.measureText(_e.config.title).width;' +
    'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
    'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=It.opacity,' +
    'W.beginPath();' +
    'const _uny=_Ga+mn+_lUlO,_uty=_fa+jt+_lUlO;' +
    'W.moveTo(Oe,_uny),W.lineTo(Oe+_nw,_uny),W.stroke(),' +
    'W.globalAlpha=nn.opacity,W.beginPath(),W.moveTo(Oe,_uty),W.lineTo(Oe+_tw,_uty),W.stroke();' +
    'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=It.opacity,' +
    'me.beginPath(),me.moveTo(Oe,_uny),me.lineTo(Oe+_nw,_uny),me.stroke(),' +
    'me.globalAlpha=nn.opacity,me.beginPath(),me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke()' +
  '}';

// -----------------------------------------------------------------------------
// Replacement — same structure but thickness / offset / font-size / Y-distance
// multiplied by `tr` (current animation scale factor). On non-Meta animations
// tr === 1 so behaviour is identical to before. On Meta, the underline now
// scales, drifts and fades in perfect lockstep with the text bitmap while
// staying out of the shadow-casting path (so it renders on top of shadows).
// -----------------------------------------------------------------------------
const NEW =
  'if(_e.config.underline){' +
    'var _lUlT=(_e.config.underlineThickness??2)*tr,_lUlO=(_e.config.underlineOffset??2)*tr;' +
    'if(xn){' +
      'W.font=`${ea} ${rn} ${os*tr}px "${_e.config.font}", sans-serif`;' +
      'const _ew=W.measureText(xn).width,_euy=_Fn+os*tr+_lUlO;' +
      'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
      'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=pn.opacity,' +
      'W.beginPath(),W.moveTo(Oe,_euy),W.lineTo(Oe+_ew,_euy),W.stroke();' +
      'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=pn.opacity,' +
      'me.beginPath(),me.moveTo(Oe,_euy),me.lineTo(Oe+_ew,_euy),me.stroke()' +
    '}' +
    'W.font=`${ea} ${rn} ${mn*tr}px "${_e.config.font}", sans-serif`;' +
    'const _nw=W.measureText(_e.config.name).width;' +
    'W.font=`${ea} ${zn} ${jt*tr}px "${_e.config.font}", sans-serif`;' +
    'const _tw=W.measureText(_e.config.title).width;' +
    'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
    'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=It.opacity,' +
    'W.beginPath();' +
    'const _uny=_Ga+mn*tr+_lUlO,_uty=_fa+jt*tr+_lUlO;' +
    'W.moveTo(Oe,_uny),W.lineTo(Oe+_nw,_uny),W.stroke(),' +
    'W.globalAlpha=nn.opacity,W.beginPath(),W.moveTo(Oe,_uty),W.lineTo(Oe+_tw,_uty),W.stroke();' +
    'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=It.opacity,' +
    'me.beginPath(),me.moveTo(Oe,_uny),me.lineTo(Oe+_nw,_uny),me.stroke(),' +
    'me.globalAlpha=nn.opacity,me.beginPath(),me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke()' +
  '}';

// Unique marker that proves the patch ran (not present in OLD):
const APPLIED_MARKER = '(_e.config.underlineThickness??2)*tr';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-underline-scale] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  const src = fs.readFileSync(BUNDLE, "utf8");

  if (src.includes(APPLIED_MARKER)) {
    console.log("[patch-underline-scale] already applied — nothing to do.");
    return;
  }

  const occurrences = src.split(OLD).length - 1;
  if (occurrences === 0) {
    console.error(
      "[patch-underline-scale] target block not found. Bundle may have changed — aborting.",
    );
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error(
      `[patch-underline-scale] target block found ${occurrences}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }

  const patched = src.replace(OLD, NEW);
  if (!patched.includes(APPLIED_MARKER)) {
    console.error("[patch-underline-scale] post-patch sanity check failed.");
    process.exit(1);
  }

  fs.writeFileSync(BUNDLE, patched, "utf8");
  console.log(
    "[patch-underline-scale] OK — underline now scales with text (tr factor) on Meta; identity on other animations.",
  );
  console.log(
    `[patch-underline-scale]   bytes: ${src.length} -> ${patched.length}  (delta ${patched.length - src.length >= 0 ? "+" : "-"}${Math.abs(patched.length - src.length)})`,
  );
}

main();
