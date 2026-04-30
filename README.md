# Lower Thirds Generator — Offline

A self-contained desktop / local-server build of the Lower Thirds Generator.
Runs as either a plain Node + browser app or as a packaged Electron app, with
optional NDI fill+key output for broadcast workflows.

## Requirements

- **Node.js 18 or later** ([nodejs.org](https://nodejs.org)) for the
  command-line / browser flow.
- **macOS 13+** (Apple Silicon) for the packaged Electron app and NDI output.
- No internet connection is required after first run except as listed under
  [Internet requirements](#internet-requirements) below.

## Quick start (browser flow, end users)

### macOS

Double-click **`Launch Lower Thirds.command`**.

If macOS blocks it, right-click → **Open** → **Open** in the dialog.

### Windows

Double-click **`Launch Lower Thirds.bat`**.

### What the launcher does

1. Checks that Node.js is installed.
2. On first run only, installs the one required package (`express`) — takes
   about 5 seconds.
3. Starts the local server at `http://localhost:3000`.
4. Opens your browser automatically.

To stop, close the Terminal / Command Prompt window that the launcher opened.

## Quick start (Electron app)

The packaged Electron app is built via `npm run build:mac` and bundles its
own Node, ffmpeg, and the native NDI sender. End users get a `.dmg` and
double-click `Lower Thirds Generator.app`.

For development:

```bash
npm install
npm run electron       # launches the Electron app pointing at the local server
```

## Features

- Full Lower Thirds Generator interface (identical to the online build).
- Cues are saved in the browser's `localStorage`.
- Pop-out windows (Feed 1 / Filter 1) for live broadcast use.
- Companion HTTP API at `http://localhost:3000/api/companion` with a
  downloadable Bitfocus Companion config.
- Native NDI Fill + Key output (Electron build only) — toggle from
  **View → NDI Output**.
- No login required.

## Repository layout

```
server/                Express HTTP layer (ESM)
  app.js               Express factory; mounts middleware, routers, SPA
  index.js             standalone CLI entry
  companionConfig.js   pure Companion .companionconfig + button-layout generator
  validation.js        zod schemas
  routes/              one file per resource (companion, network, update)
  middleware/          cors, headers, error handler
  services/            business logic (companion sync, status, tally shaping)
  state/               in-memory + on-disk state singletons
  lib/                 shared utilities (version compare, package.json read)
  overlay/             *.client.js — browser-injected scripts (update banner, font warmup)
electron/              Electron main process (CommonJS)
  main.cjs             entry; embeds Express, builds menu, IPC, NDI orchestration
  preload.cjs          contextBridge surface
  ndiSender.cjs        NDI capture + send orchestration
  updater.cjs          GitHub Releases auto-updater
  ffmpegNative.cjs     bundled ffmpeg detection + spawn
  native/ndi-sender/   N-API C++ addon wrapping NDI SDK
patches/               post-build hot-patches against dist/public/assets/index-*.js
                       (see patches/README.md for the full story)
scripts/               build / verification helpers
tests/                 vitest + supertest test suites
build/                 macOS DMG packaging + ffmpeg fetcher
```

## Internet requirements

Most features run fully offline. Two exceptions:

- **Export page**: on first use per session, downloads the FFmpeg core
  (~32 MB) from `cdn.jsdelivr.net`. Once cached by the browser, subsequent
  exports work offline until the cache is cleared.
- **"Check for Updates"**: contacts `api.github.com/repos/.../releases/latest`.
  Skip the menu item to opt out; the app works fine without it.

## Troubleshooting

- **Browser shows "Cannot connect"** — wait 2 seconds and refresh; the server
  may still be starting.
- **macOS "cannot be opened because it is from an unidentified developer"** —
  right-click the `.command` file → **Open** → click **Open** in the dialog.
- **Port conflict** — if port 3000 is in use, the Mac launcher automatically
  picks the next available port (3001, 3002, …). The Windows launcher always
  uses 3000; close any other app on that port first.
- **Node.js not found on Mac even though it's installed** — `nvm`-managed
  Node may not be in the PATH used by `.command` files. From Terminal:
  ```bash
  cd "/path/to/this/folder"
  node server/index.js
  ```
  then open `http://localhost:3000`.

## Development

### Run tests

```bash
npm test
```

The `pretest` hook runs `scripts/check-bundle-hash.cjs` first to verify the
shipped renderer bundle matches `patches/.bundle-pin`. If it doesn't, every
patch script will silently fail to apply, so we fail loudly here instead.
See [`patches/README.md`](patches/README.md) for the full story.

### NDI module

The native NDI sender is in [`electron/native/ndi-sender/`](electron/native/ndi-sender/).
Build it with `npm run ndi:build` (against system Node) and rebuild for
Electron's ABI with `npm run ndi:rebuild-electron`. Requires the
[NDI SDK for Apple](https://ndi.video/for-developers/ndi-sdk/) installed at
`/Library/NDI SDK for Apple` on the build machine.

### Patch architecture

The renderer is shipped as a pre-built bundle at
`dist/public/assets/index-*.js`. Renderer-side features are added via
post-build `string.replace` patches in [`patches/`](patches/) — see that
folder's `README.md` for the full architecture, ordering rules, and exit
strategies.

## License

Internal — see contracting agreement.
