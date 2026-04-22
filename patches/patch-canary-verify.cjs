/*
 * patch-canary-verify.cjs
 *
 * Puts an unmistakable visual marker on the Live page so we can confirm
 * the patched bundle is actually the one loaded by Chromium / Electron.
 * Changes the "Play Cue" button label to "Play Cue [v2]".
 *
 * If you relaunch the app and the button says "Play Cue [v2]", the
 * patched bundle is live. If it still says "Play Cue", Electron or the
 * HTTP cache is serving a stale bundle from somewhere.
 *
 * Remove the canary later by reverting this patch (or just
 * `git checkout -- dist/public/assets/index-iitzneuS.js`).
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

const OLD = ':"Play Cue"]';
const NEW = ':"Play Cue [v2]"]';
const MARKER = '"Play Cue [v2]"';

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`[patch-canary-verify] bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) {
    console.log("[patch-canary-verify] already applied");
    return;
  }
  const n = src.split(OLD).length - 1;
  if (n !== 1) {
    console.error(
      `[patch-canary-verify] expected exactly 1 occurrence of ${JSON.stringify(OLD)}, found ${n}`,
    );
    process.exit(1);
  }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log('[patch-canary-verify] OK — "Play Cue" → "Play Cue [v2]"');
}

main();
