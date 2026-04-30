# `patches/` — bundle hot-patch scripts

This directory exists because the React renderer for the Lower Thirds Generator
ships as a **pre-built minified bundle** (`dist/public/assets/index-*.js`). The
canonical source for the renderer is not in this repository.

Every feature and fix that touches the renderer is therefore implemented as a
post-build `string.replace` against that bundle. There are 40+ such patch
scripts in this folder and a runner [`apply-all.cjs`](apply-all.cjs) that
applies them in a strict, hand-maintained order.

This is a fragile architecture and the surrounding code review flagged it as
the dominant code-quality risk in the repo. **This README exists so the
fragility is documented, not so it's defended.** If you're picking up this code,
you should plan to retire this approach.

---

## What's here

```
patches/
├── README.md                 (this file)
├── .bundle-pin               JSON: pinned bundle filename + sha256
├── apply-all.cjs             runner with the canonical patch order
└── patch-*.cjs               individual patch scripts (40+)
```

Each `patch-*.cjs` file is a small Node script that reads the bundle from
`dist/public/assets/index-iitzneuS.js`, runs one or more `code.replace(...)`
operations, and writes the result back. Most are idempotent (re-running them
is a no-op if their target string has already been replaced).

## Why this works at all

A guarantee is built in: every patch operates against the **same exact bundle
byte stream**. That stream is recorded in [`.bundle-pin`](.bundle-pin):

```json
{
  "filename": "index-iitzneuS.js",
  "sha256":   "...",
  "size":     712108
}
```

If the bundle is rebuilt (e.g. by re-running Vite from the upstream React
source tree), three things change:

1. The **filename** changes — Vite produces content-hashed filenames like
   `index-aBc123De.js`. Every patch hard-codes `index-iitzneuS.js` and would
   silently fail to find the file.
2. The **content hash** changes — even if the filename were stable, the
   minifier may reshuffle local variable names. Every `string.replace` anchor
   like `H.shadowBlur=q,H.shadowOffsetX=ie` could no longer match.
3. **Patch order** dependencies break — many patches anchor against earlier
   patches' output. If anchor strings move, the whole chain falls over.

The result of a silent break is a renderer that loads but is missing every
feature added by patches. Catching that in production is brutal.

## The guard

[`scripts/check-bundle-hash.cjs`](../scripts/check-bundle-hash.cjs) verifies
the live bundle in `dist/public/assets/` matches `.bundle-pin`. It runs as
the `pretest` npm hook, so any `npm test` will fail loud-and-clear if the
bundle drifts.

```bash
npm run check:bundle           # verify only
node scripts/check-bundle-hash.cjs --update  # repin to current bundle
```

This does **not** save you from a broken patch chain. It only stops a silent
bundle swap from shipping. If the bundle changes legitimately, you must
re-author the affected patches by hand and only then refresh the pin.

## Patch ordering

The order in [`apply-all.cjs`](apply-all.cjs) is **load-bearing**. Patches
that anchor against earlier patches' output rely on those earlier patches
having already run. The script's inline comments document the dependencies
patch-by-patch — read those before re-ordering anything.

Notable ordered groups:

- **Live + Edit page render-loop perf** — first block; foundation for later
  shadow / underline / border patches.
- **Export pipeline (tier A1-B3)** — frame writes, ffmpeg config, single-PNG
  seek, progress callbacks. Self-contained.
- **Tier C1 + C2 (native ffmpeg + WebCodecs)** — order strict; native-ffmpeg
  must land before webcodecs-mp4 because the latter's anchor is the former's
  rewritten code.
- **MOV alpha Premiere 2026 compatibility** — args change must precede
  byte-patching so the muxer output is shaped right.
- **Shadow / underline / border z-order fixes** — many patches; each one's
  anchor is the previous one's output. Read the comments.

## When you'll want to escape this

Three real exits, ordered by ROI:

### A — Recover the React source

The cleanest exit. If the React/TypeScript source for the renderer is
recoverable somewhere (private repo, build server, contractor's machine,
older laptop), bring it back into this repo. Each patch becomes a normal
source change. Multi-day scope to import + verify the build matches today's
behaviour, but kills the entire architecture.

### B — Convert string-replace to AST transforms

Use `@babel/parser` + `@babel/traverse` to find anchor points by AST shape
rather than by literal string match. Patches survive minifier output changes
(local var renames, statement reordering). Roughly 1-2 weeks for all 40+.
Doesn't help with the source-recovery problem (you're still patching opaque
output) but protects against the hash-changed-on-rebuild failure mode.

### C — Status quo plus this guard

Where we are now. The pin guard catches accidental bundle swaps. Patch
ordering remains hand-maintained. Adding a new feature still means writing
a new `patch-*.cjs` against the current bundle.

## Conventions for new patches

If you must add another:

1. Read [`apply-all.cjs`](apply-all.cjs) end-to-end first to understand
   ordering constraints.
2. Anchor your `replace()` against a string that includes some surrounding
   context, not just a 3-character minified identifier — minifiers reshuffle
   short identifiers across builds.
3. Make the patch idempotent: detect the post-state and bail early. The
   existing patches do this; mimic them.
4. Append to [`apply-all.cjs`](apply-all.cjs) at the position dictated by
   your patch's dependencies. Document the dependency in a comment above the
   entry.
5. Run `node patches/apply-all.cjs && node scripts/check-bundle-hash.cjs --update`
   to apply your change and refresh the pin. Commit the new pin in the same
   PR as the patch.

## Conventions for repinning

When you intentionally rebuild (or re-author all patches against a new
bundle):

```bash
# 1. Replace dist/public/assets/index-*.js with the new bundle.
# 2. Re-author every patch in this folder against the new anchors.
# 3. Run apply-all to confirm the chain still works:
node patches/apply-all.cjs

# 4. Refresh the pin (records the new filename + hash):
node scripts/check-bundle-hash.cjs --update

# 5. Commit dist/public/assets/index-*.js + patches/ + .bundle-pin together.
```
