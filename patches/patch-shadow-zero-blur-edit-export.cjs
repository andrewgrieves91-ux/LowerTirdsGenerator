/*
 * patch-shadow-zero-blur-edit-export.cjs
 *
 * Extends patch-shadow-zero-blur-and-underline.cjs (Live) to the Edit
 * and Export render paths. Same bug: the shadow pass iterates
 * `Math.ceil(shadowBlur / 10)` times, which is 0 at blur=0, so no shadow
 * renders.
 *
 * Edit `Ye()` render function (byte ~577219) has two shadow loops — one
 * in the Meta/cache branch and one in the non-Meta/inline fallback
 * branch. Both use the same minified snippet and both need clamping.
 *
 * Export `Tc()` (byte ~650268) has two shadow loops:
 *   - Meta branch (uses `_dse` helper): `Math.ceil((p.shadowBlur??10)/10)`
 *   - Non-Meta branch: `(p.shadowEnabled?Math.ceil(..):1)` — the `:1`
 *     fallback here incorrectly runs one iteration when shadow is OFF
 *     (Live's shadow-dedup patch already fixed this pattern for Live by
 *     changing `:1` to `:0`). We apply the same fix here.
 *
 * For consistency with Live, we clamp every iteration count with
 * Math.max(1, ...) so the shadow renders even at blur=0.
 *
 * Idempotent.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname,"..","dist","public","assets","index-iitzneuS.js");

const REPLACEMENTS = [
  {
    label: "Edit Ye() shadow loops (meta + non-meta) — min-1 iter",
    // Same minified snippet appears twice in Ye() — replaceAll.
    old: "for(var _bp=0;_bp<Math.ceil(q/10);_bp++)",
    new: "for(var _bp=0;_bp<Math.max(1,Math.ceil(q/10));_bp++)",
    applied_marker: "for(var _bp=0;_bp<Math.max(1,Math.ceil(q/10));_bp++)",
    expect_old_count: 2,
    replace_all: true,
  },
  {
    label: "Export Tc() meta-branch shadow loop — min-1 iter",
    old: "for(var _bp=0;_bp<Math.ceil((p.shadowBlur??10)/10);_bp++)",
    new: "for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/10));_bp++)",
    applied_marker: "for(var _bp=0;_bp<Math.max(1,Math.ceil((p.shadowBlur??10)/10));_bp++)",
    expect_old_count: 1,
  },
  {
    label: "Export Tc() non-meta-branch shadow loop — min-1 iter + :1 → :0",
    old: "(p.shadowEnabled?Math.ceil((p.shadowBlur??10)/10):1)",
    new: "(p.shadowEnabled?Math.max(1,Math.ceil((p.shadowBlur??10)/10)):0)",
    applied_marker: "(p.shadowEnabled?Math.max(1,Math.ceil((p.shadowBlur??10)/10)):0)",
    expect_old_count: 1,
  },
];

function main() {
  if (!fs.existsSync(BUNDLE)) { console.error(`bundle not found: ${BUNDLE}`); process.exit(1); }
  let src = fs.readFileSync(BUNDLE, "utf8");
  let changed = false;
  for (const r of REPLACEMENTS) {
    if (src.includes(r.applied_marker)) {
      console.log(`[patch-shadow-zero-blur-edit-export] ${r.label}: already applied`);
      continue;
    }
    const n = src.split(r.old).length - 1;
    if (n !== (r.expect_old_count || 1)) {
      console.error(
        `[patch-shadow-zero-blur-edit-export] ${r.label}: expected ${r.expect_old_count || 1} target(s), found ${n} — aborting`,
      );
      process.exit(1);
    }
    if (r.replace_all) {
      src = src.split(r.old).join(r.new);
      console.log(`[patch-shadow-zero-blur-edit-export] ${r.label}: ${n} site(s) patched`);
    } else {
      src = src.replace(r.old, r.new);
      console.log(`[patch-shadow-zero-blur-edit-export] ${r.label}: applied`);
    }
    changed = true;
  }
  if (!changed) { console.log("[patch-shadow-zero-blur-edit-export] already fully applied."); return; }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-shadow-zero-blur-edit-export] OK");
}
main();
