/*
 * patch-edit-gap-defaults.cjs
 *
 * Edit page used `useState(29)` and `useState(19)` as defaults for
 * eyebrow gap and title gap respectively. Live and Export both fall
 * back to `?? 8` / `?? 10` when the cue has no value. So a cue with
 * unset gaps shows different vertical spacing on Edit vs Live/Export.
 *
 * Aligns Edit's defaults to 8 / 10 so all three pipelines render the
 * same spacing for cues without explicit gap values.
 *
 * Idempotent + atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Both useState calls live in a single tuple-destructuring chain
// inside the editor component. We anchor on the surrounding pattern
// so we don't accidentally rewrite an unrelated useState(29) elsewhere.
const OLD = "[he,fe]=y.useState(29),[re,F]=y.useState(19)";
const NEW = "[he,fe]=y.useState(8),[re,F]=y.useState(10)";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(NEW)) {
    console.log("[patch-edit-gap-defaults] already applied");
    return;
  }
  const n = src.split(OLD).length - 1;
  if (n === 0) {
    console.error("[patch-edit-gap-defaults] anchor not found");
    process.exit(1);
  }
  if (n !== 1) {
    console.error(`[patch-edit-gap-defaults] anchor not unique (${n})`);
    process.exit(1);
  }
  src = src.replace(OLD, NEW);
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-gap-defaults] OK — eyebrowGap default 29->8, titleGap default 19->10");
}
main();
