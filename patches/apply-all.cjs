/*
 * apply-all.cjs
 *
 * Runs every performance patch in this directory in a well-defined order.
 * Each patch is idempotent, so re-running this script after a `git checkout`
 * of the bundle will re-apply the full stack cleanly.
 *
 * Usage:
 *   node patches/apply-all.cjs
 */

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PATCHES = [
  "patch-live-perf.cjs",
  "patch-render-idle-skip.cjs",
  "patch-render-shadow-dedup.cjs",
  "patch-countdown-throttle.cjs",
  "patch-underline-scale.cjs",
  "patch-underline-logo-offset.cjs",
  "patch-shadow-zero-blur-and-underline.cjs",
  "patch-border-scale.cjs",
  "patch-border-scale-edit-export.cjs",
  "patch-shadow-zero-blur-edit-export.cjs",
  "patch-meta-underline-shadow-scale-edit-export.cjs",
  "patch-underline-logo-offset-correct.cjs",
  // Export pipeline (tiers A1-B3)
  "patch-export-ffmpeg-cache.cjs",
  "patch-export-stream-frames.cjs",
  "patch-export-mp4-quality.cjs",
  "patch-export-framerate-config.cjs",
  "patch-export-single-png-seek.cjs",
  "patch-export-ffmpeg-progress.cjs",
  // Tier C1 + C2 — order matters: native-ffmpeg must land before
  // webcodecs-mp4 because the latter's anchor is the former's code.
  "patch-export-native-ffmpeg.cjs",
  "patch-export-webcodecs-mp4.cjs",
  "patch-export-inject-webcodecs-script.cjs",
  // MOV alpha Premiere 2026 compatibility (ordered: args change first so
  // the byte-patching removal can rely on correct muxer output).
  "patch-export-mov-alpha-args.cjs",
  "patch-export-remove-depth-hack.cjs",
  // Restores the vendor swap (FFMP -> appl) that remove-depth-hack
  // incorrectly deleted. The depth flip stays gone; only the vendor
  // swap is brought back. Premiere 2026 needs the container vendor
  // field patched.
  "patch-export-restore-vendor-swap.cjs",
  // Color regression fix in Tc Meta path (alphaCanvas -> colorCanvas)
  // + logo white-tint removal + byte-patch the NATIVE ffmpeg output
  // buffer (the WASM byte-patch never ran on the Tier C1 path, so
  // native exports came out with FFMP vendor and zero icpf alpha
  // flags). Must come last in the export sequence; it depends on
  // the native-ffmpeg branch and the WASM byte-patch already being
  // in place to keep the constants compatible.
  "patch-export-alpha-color-and-native-bytepatch.cjs",
  // Right-edge text clipping (italic glyphs spilling past advance
  // width into a too-tight canvas region) + underline shadow drawn
  // OVER the text in Tc Meta path (z-order: hoist the underline
  // strokes to before the text shadow loop + visible passes).
  "patch-export-text-rightclip-and-underline-zorder.cjs",
  // Same z-order fix extended to Live `Kt` and Edit `Ye` Meta-branch
  // renderers — underline + shadow now lands BEFORE the text shadow
  // loop on the color context, so text covers any underline-shadow
  // bleed inside the text bounding box.
  "patch-live-edit-meta-underline-zorder.cjs",
  // Tc non-Meta path: the export underline rendering for every
  // animation type EXCEPT Meta had no shadow at all (it just set
  // n.filter="none" and stroked). This patch replaces that block
  // with a shadow-aware version (mirrors the Meta variant) AND
  // hoists it to before the if(xe){letterOpacities-path}
  // else{shadow-loop-path} branch, so its shadow lands behind
  // the subsequent text rendering.
  "patch-tc-nonmeta-underline-shadow-and-zorder.cjs",
  // Edit Ye non-Meta underline blocks (eyebrow + name + title): wrap
  // each existing stroke group with shadow setup/reset so the Edit
  // page WYSIWYG canvas shows the underline shadow for non-Meta
  // animations (matches what Meta already had). Z-order is left
  // implicit — the existing post-loop drop-shadow text re-render
  // covers any underline shadow that bled into the text region.
  "patch-edit-nonmeta-underline-shadow.cjs",
  // Export factory `_c()`: when borderEnabled, the strokeText border
  // extends past the glyph fill bounds. The factory's text-width
  // constants (D, k, L) didn't account for the stroke, so the right
  // edge of bordered text was clipped at the source canvas. Live's
  // factory K() already adds `+_bw`; this patch brings _c() in line
  // by appending `+(i.borderEnabled?(i.borderWidth||2)*_RS:0)` to
  // each width.
  "patch-export-border-rightclip.cjs",
  // Shadow density build-up factor: change `Math.ceil(blur/10)` →
  // `Math.ceil(blur/15)` in Live, Tc Meta, Tc non-Meta loops, AND
  // switch Tc non-Meta from context `shadow*` (separate stroke + fill
  // shadows) to drop-shadow CSS filter (single combined-mask halo
  // matching Meta). Together: thick-border shadow stays in shape but
  // is less aggressive, and non-Meta border now visibly casts a
  // shadow that matches Meta's appearance.
  "patch-shadow-tune-and-tc-nonmeta-filter.cjs",
  // Same `/10 → /15` divisor change applied to Edit `Ye` Meta and
  // non-Meta shadow loops. Both use the local var `q` for shadowBlur
  // (different name, same intent) — handled separately to keep the
  // Tc-focused patch above narrow.
  "patch-edit-shadow-iter-tune.cjs",
  // Edit non-Meta proper shadow approach (replaces the earlier reverted
  // attempt). Pre-renders fill+border into an off-screen temp canvas,
  // then drawImage's that temp onto H with the drop-shadow filter. This
  // produces a SINGLE combined-mask shadow halo (matching Meta's
  // factory-based render). Border ends up on top of fill, fill_shadow
  // can no longer overlay border, no per-element interference.
  "patch-edit-nonmeta-tempcanvas-shadow.cjs",
  // Final underline z-order tweak: move the Live/Edit-Meta/Tc-Meta
  // underline blocks from BEFORE the text shadow loop to AFTER it
  // (just before the visible text passes). Order becomes:
  //   text shadow → underline + its shadow → visible text.
  // Underline now stays on top of text shadow in the strip below the
  // text where shadow halo extends down. Visible text covers any
  // underline-shadow that bled UP into the text bounding box. Both
  // earlier complaints are resolved without trade-off.
  "patch-underline-zorder-after-text-shadow.cjs",
  // Tc non-Meta export path: move the underline block to AFTER the
  // text-rendering branches and the logo final draw (i.e. just before
  // the closing `n.restore()}` of Tc). Underline ends up topmost on
  // the export. Only Meta has the layered "shadow → underline →
  // visible text" trick available; non-Meta has no separate visible
  // pass so underline-on-top is the closest equivalent.
  "patch-tc-nonmeta-underline-final-zorder.cjs",
  // Edit non-Meta: extend the temp-canvas-shadow patch to also paint
  // the three underline strokes onto the temp canvas. The drop-shadow
  // halo is now computed from a combined (text+border+underline)
  // alpha mask, so the halo wraps around the OUTER outline of all
  // three together and never overlays the underline pixels.
  "patch-edit-nonmeta-tempcanvas-add-underlines.cjs",
  // Final final underline z-order tweak: hoist the Live Kt / Edit
  // Ye Meta / Tc Meta underline blocks AFTER the visible text passes,
  // so the underline lands on top of EVERYTHING — including the
  // border that's pre-rendered into colorCanvas. Trade-off: any
  // underline-shadow that bleeds upward into the text region will
  // sit on top of the text. User explicitly prioritised "underline
  // above border".
  "patch-underline-zorder-after-visible-text.cjs",
  // Drop the shadow on the Meta-path underline strokes so the
  // underline doesn't paint a halo on top of the text/border. The
  // underline still renders on top of everything; it just doesn't
  // cast a shadow itself any more. The text+border still get their
  // own drop-shadow halo from the shadow loop.
  "patch-disable-underline-shadow.cjs",
  // Final "unified shadow" approach for Meta paths: build a temp
  // canvas at runtime that holds (text + border + underline) and
  // run the drop-shadow filter on the combined alpha mask. Single
  // halo wraps around the OUTER outline of all elements together;
  // no internal stacking, no separate underline shadow over text,
  // no border-over-underline. Tc Meta first.
  "patch-meta-unified-shadow.cjs",
  // Same temp-canvas unified-shadow approach now applied to Live Kt
  // Meta path. (Edit Ye Meta would be a similar refactor; deferred
  // until user confirms this approach gives the right look.)
  "patch-live-kt-meta-unified-shadow.cjs",
  // Edit Ye Meta path now also uses the same temp-canvas unified
  // shadow. Replaces the entire if(z){...}else{...} structure with
  // a single block that builds a temp canvas (text+border+underline),
  // runs drop-shadow on it, and composites onto H. Underline now
  // ALWAYS renders (the old code only ran the underline branch when
  // shadow was enabled).
  "patch-edit-ye-meta-unified-shadow.cjs",
  // Performance: cache the unified-shadow temp canvas across frames.
  // Without this, Live Kt allocates a fresh 1920x1080 canvas + 2D
  // context every frame at 60Hz, which on macOS is ~3-5ms per frame
  // and is the primary cause of the dev-server "Play Cue" lag. The
  // helper installs a window-level cache and rewrites the 3 alloc
  // sites (Kt, Ye, Tc) to reuse a single canvas keyed by component.
  "patch-mt-canvas-cache.cjs",
  // Cosmetic Live page fixes: remove the dev "[v2]" suffix from the Play
  // Cue button label, and bump the two countdown setInterval bodies
  // from 500 ms to 50 ms so the .toFixed(1) seconds tick smoothly.
  "patch-live-play-cue-button.cjs",

  // ====================================================================
  // unify-meta-render-pipelines plan: Live / Edit / Export pixel parity.
  // 14 divergences ranked by visual impact. Phase 1 lands the user-
  // visible spacing/size fixes; Phase 2 the medium-impact shadow/measure
  // fixes; Phase 3 the sub-pixel rounding/X fixes.
  // ====================================================================

  // Phase 1: visible to the eye.
  // Edit's editor component initialised eyebrow/title gap state with
  // `useState(29)` / `useState(19)` while Live/Tc fall back to ?? 8 / ?? 10.
  // For cues with no explicit gap, Edit showed completely different
  // vertical spacing. Aligns the editor defaults to 8 / 10.
  "patch-edit-gap-defaults.cjs",
  // Edit's xR factory measured text width with `.width` only. Live's K
  // and Export's _c use Math.max(.width, .actualBoundingBoxRight||0) so
  // italic/decorative glyphs that overhang advance width aren't clipped.
  "patch-edit-factory-width-bbox.cjs",
  // Edit's xR added the scaled border to NEITHER W nor H. Live adds it
  // to both. Without it, a thick border draws into a smaller content
  // rectangle in Edit than Live/Export, clipping the stroke and shifting
  // the underline below the visible glyphs.
  "patch-edit-factory-border-in-size.cjs",
  // Export's _c factory added the scaled border to W only, not H. Adds
  // it to the three height metrics so heights match widths and a thick
  // border doesn't clip top/bottom of glyphs in the export frame.
  "patch-export-factory-border-in-height.cjs",
  // Edit's xR was called with `_xms = (At==="meta"?4:1)`, so its
  // colorCanvas was rasterized at 4x for Meta. Live rasterizes at
  // 1.121x. Same logical size after composition but very different
  // anti-aliasing (4x->1x downsample is sharper than 1.121x->1x).
  // Drops Edit to 1.121x to match Live exactly.
  "patch-edit-factory-canvas-size.cjs",
  // Edit's `Ye` only entered the factory branch when `An && Oe` (Meta
  // only). Non-Meta animations went through direct strokeText/fillText
  // at 1x rasterization while Live/Tc oversample. Restructures to
  // `if(Oe){if(An){<meta>}else{<non-meta-factory>}}else{<direct>}` so
  // any non-syncTest animation in Edit uses the same factory pipeline
  // as Live/Tc.
  "patch-edit-ye-non-meta-factory.cjs",

  // Phase 2: visible at certain settings.
  // Tc Meta underline measured text width at base font size and
  // multiplied by `ue` (the meta scale). Kt/Ye scale the staging
  // context's font BEFORE measuring. Advance-width rounding at
  // different em sizes is non-linear, so the two approaches give
  // different underline widths in many fonts. Aligns Tc to Kt/Ye.
  "patch-tc-underline-measure.cjs",
  // Tc used `p.shadowColor || "#000000"` in some paths and `??` in
  // others. Live uses `??` everywhere. Standardise on `??` so an empty
  // string (`""`) doesn't accidentally fall back to black in Tc only.
  "patch-tc-shadow-color-coalesce.cjs",
  // Ye's direct path allocated a fresh `_shTC` shadow canvas every
  // frame and ran the shadow draw loop even when shadow was disabled.
  // Wires the alloc through `__ltGetMtCanvas("ye-direct", ...)` and
  // gates the loop on `z`. Direct path is rare after the non-meta
  // factory patch above (only syncTest hits it) but still worth fixing.
  "patch-edit-ye-direct-canvas-cache.cjs",

  // Phase 3: sub-pixel parity.
  // Three different rounding strategies for posY in Meta path: Kt raw,
  // Ye rounded, Tc raw. Round in all three so the integer Y is the
  // same across renderers (eyebrow/title inherit alignment from name).
  "patch-unify-posy-rounding.cjs",
  // Live Kt factory used a single X (`Oe = ln + It.x`) for ALL three
  // glyph drawImages, ignoring per-element animation X (`pn.x`, `nn.x`)
  // for non-Meta animations. Tc factory and Ye direct use per-glyph X.
  // Introduces `_eX/_nX/_tX` aliases and substitutes them.
  "patch-kt-nonmeta-perglyph-x.cjs",
  // Tc's letter-opacity (direct) path rounded X with `Math.round(te+...)`
  // while Kt and Ye never round X. Drops the rounding for parity.
  "patch-tc-x-no-round.cjs",
  // Tc Meta used a `_dse(translate+scale+drawImage(0,0,w,h))` helper
  // while Kt/Ye use raw `drawImage(src, sx,sy,sw,sh, dx,dy, sw*Q,sh*Q)`.
  // Browsers can produce sub-pixel different results between the two
  // call shapes. Replaces the three `_dse` calls with the raw form.
  "patch-tc-replace-dse.cjs",

  // ====================================================================
  // Follow-up fixes from user testing of the unified pipeline.
  // ====================================================================

  // Border thickness was contributing to vertical spacing because the
  // factory's `nameContentH` / `eyebrowContentH` include the scaled
  // border + 4px padding. Renderers used `nameContentH * G` to compute
  // title Y from name Y, which made title move DOWN as border grew
  // (and eyebrow move UP). Switches Meta-path spacing to use raw font
  // size + meta scale only, so border has zero effect on line spacing.
  "patch-spacing-fontsize-not-contenth.cjs",
  // Title weight selection used `titleFontWeight || bodyWeight` which
  // ignored the `bold` flag. With a custom titleFontWeight set, toggling
  // bold left the title at its custom weight while eyebrow/name went
  // 700. Adds a `bold ? "700" :` prefix to title weight selection in
  // all 3 factories AND the 3 renderer-side font templates.
  "patch-bold-overrides-title-weight.cjs",
  // Non-Meta paths rounded each Y individually with
  // `Math.round(posY + nameFontSize + titleGap)`, while Meta uses
  // `Math.round(posY) + nameFontSize + titleGap`. For fractional posY
  // the two differed by +/- 1 px, so switching from Meta to a non-Meta
  // animation jumped the spacing visibly. Reorders the non-Meta var
  // declarations to derive eyebrow/title from the rounded name Y so
  // both paths produce identical Y values at meta-scale=1.
  "patch-non-meta-spacing-from-rounded-name.cjs",
];

let ok = true;
for (const name of PATCHES) {
  const full = path.resolve(__dirname, name);
  console.log(`\n==> ${name}`);
  const res = spawnSync(process.execPath, [full], { stdio: "inherit" });
  if (res.status !== 0) {
    ok = false;
    console.error(`[apply-all] ${name} failed with exit ${res.status}`);
    break;
  }
}

if (!ok) {
  process.exit(1);
}
console.log("\n[apply-all] all patches applied successfully.");
