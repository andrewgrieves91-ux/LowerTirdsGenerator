/*
 * patch-live-decklink-selector.cjs
 *
 * Wires the runtime DeckLink output overlay (server/overlay/decklink-overlay.client.js)
 * into the Live page's two existing screen-selector dropdowns:
 *
 *   • VIDEO 1: LIVE OUTPUT  (Feed 1 source) — uses local state De / Ce
 *   • FILTER 1: LIVE VIDEO  (Filter 1 source) — uses local state Ie / He
 *
 * Both dropdowns are populated by `le.map((V,ye)=>...)`, where `le` is the
 * page's enumerated displays. They feed into `ls()` and `Sn()` respectively
 * which look up `le[De]` / `le[Ie]` and call `window.open('/feed1', 'feed1', features)`
 * / `window.open('/filter1', 'filter1', features)` to pop the live preview
 * out onto the chosen display.
 *
 * This patch makes four small changes to the bundle:
 *
 *   1. Both `le.map((V,ye)=>` callsites get replaced with
 *      `(le.concat(window.__ltDecklinkOutputs||[])).map((V,ye)=>` so any
 *      DeckLink outputs published by the overlay show up as extra
 *      `<SelectItem>` rows after the regular `Display N` rows.
 *
 *   2. `le[De]` (in ls(), Feed 1 popup) → `(le.concat(window.__ltDecklinkOutputs||[]))[De]`
 *   3. `le[Ie]` (in Sn(), Filter 1 popup) → `(le.concat(window.__ltDecklinkOutputs||[]))[Ie]`
 *      so the popup-builder can resolve a DeckLink-index choice without
 *      throwing the "Selected screen not available" toast. The DeckLink
 *      entries publish zero left/top/width/height — the resulting
 *      window.open() call is intercepted by the overlay before any popup
 *      is created.
 *
 *   4. The two `onValueChange` callbacks get a tail-call into
 *      window.__ltDecklinkOnSelect(source, idx, displayCount), which the
 *      overlay uses to remember which DeckLink (if any) the user picked
 *      for each source. window.open's interception consults that flag.
 *
 * If the DeckLink overlay isn't loaded (e.g. the user is running in a
 * browser without ltElectron, or the native DeckLink addon failed to
 * load), `window.__ltDecklinkOutputs` is undefined, the `concat` falls
 * back to the original `le`, and `window.__ltDecklinkOnSelect` is a no-op.
 * The patch therefore degrades gracefully to today's behaviour.
 *
 * Idempotent: each replace() looks for the post-state and bails early
 * if it's already there.
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

const OLD_LE_MAP = "le.map((V,ye)=>";
const NEW_LE_MAP = "(le.concat(window.__ltDecklinkOutputs||[])).map((V,ye)=>";

const OLD_LE_DE = "le[De]";
const NEW_LE_DE = "(le.concat(window.__ltDecklinkOutputs||[]))[De]";

const OLD_LE_IE = "le[Ie]";
const NEW_LE_IE = "(le.concat(window.__ltDecklinkOutputs||[]))[Ie]";

const OLD_FEED1_ONCHANGE  = "value:De.toString(),onValueChange:V=>Ce(parseInt(V))";
const NEW_FEED1_ONCHANGE  =
  "value:De.toString(),onValueChange:V=>{var __ltN=parseInt(V);Ce(__ltN);if(window.__ltDecklinkOnSelect)window.__ltDecklinkOnSelect('feed1',__ltN,le.length);}";

const OLD_FILTER1_ONCHANGE = "value:Ie.toString(),onValueChange:V=>He(parseInt(V))";
const NEW_FILTER1_ONCHANGE =
  "value:Ie.toString(),onValueChange:V=>{var __ltN=parseInt(V);He(__ltN);if(window.__ltDecklinkOnSelect)window.__ltDecklinkOnSelect('filter1',__ltN,le.length);}";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-live-decklink-selector] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }

  let src = fs.readFileSync(BUNDLE, "utf8");
  const original = src;
  let changed = false;

  // ── 1. Merge DeckLink outputs into both selector dropdowns ─────────────
  // OLD_LE_MAP is expected to occur exactly twice (one per dropdown). We
  // do both via a global replace, but only after sanity-checking the
  // count so we don't accidentally hit some other future map() call.
  if (src.includes(NEW_LE_MAP)) {
    console.log("[patch-live-decklink-selector]   le.map already merged — skipping");
  } else {
    const c = src.split(OLD_LE_MAP).length - 1;
    if (c !== 2) {
      console.error(
        `[patch-live-decklink-selector] expected 2 occurrences of '${OLD_LE_MAP}', found ${c} — refusing to patch.`,
      );
      process.exit(1);
    }
    src = src.split(OLD_LE_MAP).join(NEW_LE_MAP);
    changed = true;
    console.log("[patch-live-decklink-selector]   merged DeckLink outputs into both selector dropdowns");
  }

  // ── 2 & 3. le[De] / le[Ie] popup lookups ───────────────────────────────
  if (src.includes(NEW_LE_DE)) {
    console.log("[patch-live-decklink-selector]   le[De] already merged — skipping");
  } else {
    const c = src.split(OLD_LE_DE).length - 1;
    if (c !== 1) {
      console.error(
        `[patch-live-decklink-selector] expected 1 occurrence of '${OLD_LE_DE}', found ${c} — refusing to patch.`,
      );
      process.exit(1);
    }
    src = src.replace(OLD_LE_DE, NEW_LE_DE);
    changed = true;
    console.log("[patch-live-decklink-selector]   patched ls() popup lookup (Feed 1)");
  }

  if (src.includes(NEW_LE_IE)) {
    console.log("[patch-live-decklink-selector]   le[Ie] already merged — skipping");
  } else {
    const c = src.split(OLD_LE_IE).length - 1;
    if (c !== 1) {
      console.error(
        `[patch-live-decklink-selector] expected 1 occurrence of '${OLD_LE_IE}', found ${c} — refusing to patch.`,
      );
      process.exit(1);
    }
    src = src.replace(OLD_LE_IE, NEW_LE_IE);
    changed = true;
    console.log("[patch-live-decklink-selector]   patched Sn() popup lookup (Filter 1)");
  }

  // ── 4. onValueChange tail-calls into the overlay ──────────────────────
  if (src.includes(NEW_FEED1_ONCHANGE)) {
    console.log("[patch-live-decklink-selector]   feed1 onValueChange already wired — skipping");
  } else {
    const c = src.split(OLD_FEED1_ONCHANGE).length - 1;
    if (c !== 1) {
      console.error(
        `[patch-live-decklink-selector] expected 1 occurrence of feed1 onValueChange anchor, found ${c} — refusing to patch.`,
      );
      process.exit(1);
    }
    src = src.replace(OLD_FEED1_ONCHANGE, NEW_FEED1_ONCHANGE);
    changed = true;
    console.log("[patch-live-decklink-selector]   wired feed1 onValueChange -> __ltDecklinkOnSelect");
  }

  if (src.includes(NEW_FILTER1_ONCHANGE)) {
    console.log("[patch-live-decklink-selector]   filter1 onValueChange already wired — skipping");
  } else {
    const c = src.split(OLD_FILTER1_ONCHANGE).length - 1;
    if (c !== 1) {
      console.error(
        `[patch-live-decklink-selector] expected 1 occurrence of filter1 onValueChange anchor, found ${c} — refusing to patch.`,
      );
      process.exit(1);
    }
    src = src.replace(OLD_FILTER1_ONCHANGE, NEW_FILTER1_ONCHANGE);
    changed = true;
    console.log("[patch-live-decklink-selector]   wired filter1 onValueChange -> __ltDecklinkOnSelect");
  }

  if (!changed) {
    console.log("[patch-live-decklink-selector] bundle already patched — nothing to do.");
    return;
  }

  // Sanity: post-patch, all four NEW_* strings should be present.
  for (const [name, marker] of Object.entries({
    "le.map merge":           NEW_LE_MAP,
    "le[De] merge":           NEW_LE_DE,
    "le[Ie] merge":           NEW_LE_IE,
    "feed1 onValueChange":    NEW_FEED1_ONCHANGE,
    "filter1 onValueChange":  NEW_FILTER1_ONCHANGE,
  })) {
    if (!src.includes(marker)) {
      console.error(
        `[patch-live-decklink-selector] post-patch sanity failed: ${name} marker not present.`,
      );
      process.exit(1);
    }
  }

  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log(
    `[patch-live-decklink-selector] OK — bytes: ${original.length} -> ${src.length}  (delta ${src.length - original.length})`,
  );
}

main();
