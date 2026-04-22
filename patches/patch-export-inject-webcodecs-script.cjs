/*
 * patch-export-inject-webcodecs-script.cjs  (Tier C2 support)
 *
 * Injects `<script src="/assets/ltg-webcodecs-mp4.js"></script>` into
 * dist/public/index.html so the WebCodecs MP4 helper is available on
 * every page load. The main bundle's C2 patch checks
 * `window.ltgWebcodecsMp4` before encoding MP4 so this script needs to
 * run before the bundle's Export handler.
 *
 * Placed just before the existing main bundle script tag. A regular
 * (non-module) script so it runs synchronously and finishes setup
 * before any user interaction.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const INDEX = path.resolve(__dirname, "..", "dist", "public", "index.html");

const OLD = '    <script type="module" crossorigin src="/assets/index-iitzneuS.js"></script>';
const NEW =
  '    <script src="/assets/ltg-webcodecs-mp4.js"></script>\n' +
  '    <script type="module" crossorigin src="/assets/index-iitzneuS.js"></script>';
const MARKER = 'ltg-webcodecs-mp4.js';

function main() {
  if (!fs.existsSync(INDEX)) { console.error(`index.html not found: ${INDEX}`); process.exit(1); }
  const src = fs.readFileSync(INDEX, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-inject-webcodecs-script] already applied"); return; }
  if (!src.includes(OLD)) { console.error(`[patch-export-inject-webcodecs-script] anchor not found`); process.exit(1); }
  fs.writeFileSync(INDEX, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-inject-webcodecs-script] OK — index.html now loads ltg-webcodecs-mp4.js");
}
main();
