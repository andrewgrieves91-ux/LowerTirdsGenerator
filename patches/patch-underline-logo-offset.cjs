/*
 * patch-underline-logo-offset.cjs
 *
 * In-place patch for `dist/public/assets/index-iitzneuS.js`.
 *
 * Fix for: in the Meta animation, when a logo is placed to the LEFT of the
 * eyebrow text (logoPosition === "before"), the live-drawn eyebrow underline
 * started at `Oe` — which is the left edge of the eyebrow region (i.e.
 * under the logo). The underline therefore visibly extended under the logo
 * as well as the text.
 *
 * Non-Meta animations don't exhibit this because they bake the underline
 * into the offscreen sub-region for the eyebrow text itself (which is
 * past the logo), not as a separate live pass at Oe.
 *
 * Approach:
 *   The eyebrow region drawn onto the main canvas spans horizontally
 *   from (Oe - ke*G) to (Oe - ke*G + H.eyebrow.w*G). For "before" layout
 *   the text occupies the right-hand portion of this region (after the
 *   logo + gap). The right edge of the text = the right edge of the
 *   region. So a correct underline for the eyebrow is:
 *     x_start = (right edge of region) - text_width
 *            = Oe - ke*G + H.eyebrow.w*G - _ew
 *     x_end   = x_start + _ew
 *
 *   We only apply this shift when:
 *     - Yn (Meta animation), AND
 *     - there is a logo (_e.config.logoDataUrl), AND
 *     - logo is positioned "before" (defaults to "before")
 *
 *   For every other case (no logo / logo "after" / non-Meta), x_start
 *   stays at Oe and nothing changes.
 *
 *   Name / title underlines are left untouched — those rows never
 *   contain the logo (the logo sits on the eyebrow row only).
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

// Current (post patch-underline-scale) eyebrow underline block.
const OLD =
  'const _ew=W.measureText(xn).width,_euy=_Fn+os*tr+_lUlO;' +
  'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
  'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=pn.opacity,' +
  'W.beginPath(),W.moveTo(Oe,_euy),W.lineTo(Oe+_ew,_euy),W.stroke();' +
  'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=pn.opacity,' +
  'me.beginPath(),me.moveTo(Oe,_euy),me.lineTo(Oe+_ew,_euy),me.stroke()';

// Shift eyebrow underline X to track the actual text when logo is "before" in Meta.
const NEW =
  'const _ew=W.measureText(xn).width,_euy=_Fn+os*tr+_lUlO;' +
  'var _euX=(Yn&&_e.config.logoDataUrl&&(_e.config.logoPosition??"before")==="before")' +
    '?(Oe-ke*G+H.eyebrow.w*G-_ew):Oe;' +
  'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,' +
  'W.strokeStyle=_e.config.color,W.lineWidth=_lUlT,W.globalAlpha=pn.opacity,' +
  'W.beginPath(),W.moveTo(_euX,_euy),W.lineTo(_euX+_ew,_euy),W.stroke();' +
  'me.strokeStyle="#FFFFFF",me.lineWidth=_lUlT,me.globalAlpha=pn.opacity,' +
  'me.beginPath(),me.moveTo(_euX,_euy),me.lineTo(_euX+_ew,_euy),me.stroke()';

// Unique marker proving the patch ran (not present in OLD):
const APPLIED_MARKER = 'var _euX=(Yn&&_e.config.logoDataUrl';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-underline-logo-offset] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  const src = fs.readFileSync(BUNDLE, "utf8");

  // Either the original applied-marker or the newer corrected formula
  // (installed by patch-underline-logo-offset-correct) means we're done.
  const CORRECTED_MARKER = "var _euX=Oe+(H.eyebrowLogoOffset||0)*G;";
  if (src.includes(APPLIED_MARKER) || src.includes(CORRECTED_MARKER)) {
    console.log("[patch-underline-logo-offset] already applied — nothing to do.");
    return;
  }

  const occurrences = src.split(OLD).length - 1;
  if (occurrences === 0) {
    console.error(
      "[patch-underline-logo-offset] target block not found. Bundle may have changed or patch-underline-scale hasn't been applied yet — aborting.",
    );
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error(
      `[patch-underline-logo-offset] target block found ${occurrences}x — refusing to patch ambiguously.`,
    );
    process.exit(1);
  }

  const patched = src.replace(OLD, NEW);
  if (!patched.includes(APPLIED_MARKER)) {
    console.error("[patch-underline-logo-offset] post-patch sanity check failed.");
    process.exit(1);
  }

  fs.writeFileSync(BUNDLE, patched, "utf8");
  console.log(
    "[patch-underline-logo-offset] OK — eyebrow underline now tracks text when logo is 'before' in Meta.",
  );
  console.log(
    `[patch-underline-logo-offset]   bytes: ${src.length} -> ${patched.length}  (delta ${patched.length - src.length >= 0 ? "+" : "-"}${Math.abs(patched.length - src.length)})`,
  );
}

main();
