/*
 * patch-export-framerate-config.cjs  (Tier B1)
 *
 * Removes the hard-coded 50 fps in the Export handler and reads the
 * frame rate from `localStorage.getItem("export-fps")` instead, with
 * 50 as the default when the key is unset or invalid.
 *
 * This unblocks non-50 fps exports (24 / 25 / 29.97 / 30 / 59.94 / 60)
 * without needing to rebuild the bundle each time.
 *
 * UI note: the Export page does not yet have a frame-rate dropdown —
 * adding one requires injecting React JSX into the minified bundle,
 * which is too fragile relative to the benefit for a first-cut. To set
 * the frame rate for now, open DevTools on the Export page and run:
 *
 *     localStorage.setItem("export-fps", "60");   // or 30, 25, 24, etc.
 *
 * The value is then read every time "Export" is clicked. Valid values
 * are any positive integer; non-integer fps like 29.97 must be entered
 * as 30 (ffmpeg's `-framerate` param accepts float but most exports
 * don't actually need fractional).
 *
 * The chosen fps is propagated through vb() (frame count = duration × fps)
 * and through ffmpeg's `-framerate` arg (already `String(we)`, so this
 * works unchanged).
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const OLD = 'const[oe,le]=m.split("x").map(Number),we=50;';
const NEW = 'const[oe,le]=m.split("x").map(Number),we=(()=>{try{const _f=parseInt(localStorage.getItem("export-fps"),10);return _f>0&&_f<=120?_f:50}catch(_){return 50}})();';
const MARKER = 'export-fps';

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  const src = fs.readFileSync(BUNDLE, "utf8");
  if (src.includes(MARKER)) { console.log("[patch-export-framerate-config] already applied"); return; }
  const n = src.split(OLD).length - 1;
  if (n !== 1) { console.error(`[patch-export-framerate-config] expected 1 target, found ${n}`); process.exit(1); }
  fs.writeFileSync(BUNDLE, src.replace(OLD, NEW), "utf8");
  console.log("[patch-export-framerate-config] OK — fps read from localStorage.export-fps (default 50)");
}
main();
