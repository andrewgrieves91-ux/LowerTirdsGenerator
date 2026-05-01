// frameSource.cjs
//
// Shared service that owns the two hidden offscreen BrowserWindows used to
// drive broadcast outputs (NDI Fill+Key today, DeckLink Out 1..4 added by
// the DeckLink integration). Replaces the per-sink capture timers that used
// to live inline in `ndiSender.cjs`.
//
// Why centralise: each "source" (`feed1` or `filter1`) corresponds to a
// single 1920x1080 hidden BrowserWindow that re-renders the Live page's
// canvas as a video element. Opening one of those windows per consumer
// would mean N copies of the React app rendering off-screen — wasteful,
// and they'd drift from each other timing-wise. With this service, we have
// at most one window per source, capture once per master tick, and fan the
// resulting BGRA buffer out to all subscribers (NDI sender, DeckLink
// senders, future sinks).
//
// Public API:
//   setMainWindowProvider(() => mainWin)
//   handleChildWindow(frameName)           ← called by main.cjs setWindowOpenHandler
//   subscribe(source, fps, cb)             ← returns unsubscribe fn
//   ensureOpen(source)                     ← async; resolves when window is ready
//   stopAll()                              ← closes both windows + clears subs
//
// Subscriber callbacks receive `({ buffer, width, height })` where `buffer`
// is a Node Buffer view onto the latest BGRA frame. The buffer must be
// copied if the subscriber needs to retain it past the synchronous return
// of the callback (the buffer is reused on the next tick).

"use strict";

const path = require("path");

const SOURCES = {
  feed1: {
    route: "/feed1",
    frameName: "lt-feed1-source",
    label: "feed1",
  },
  filter1: {
    route: "/filter1",
    frameName: "lt-filter1-source",
    label: "filter1",
  },
};

// Backwards-compat: ndiSender.cjs used to use these specific frame names.
// We accept them as aliases so any external code that still calls
// `window.open('/feed1', 'lt-ndi-feed1')` (or filter1) continues to work.
const LEGACY_FRAME_NAMES = {
  "lt-ndi-feed1": "feed1",
  "lt-ndi-filter1": "filter1",
  "lt-feed1-source": "feed1",
  "lt-filter1-source": "filter1",
};

const NDI_WIDTH = 1920;
const NDI_HEIGHT = 1080;

let getMainWindow = null;

// Per-source state. Lazily allocated.
const state = {
  feed1:   { win: null, subs: new Map(), timer: null, timerFps: 0, opening: null, frameCount: 0 },
  filter1: { win: null, subs: new Map(), timer: null, timerFps: 0, opening: null, frameCount: 0 },
};

let nextSubId = 1;

function setMainWindowProvider(fn) {
  getMainWindow = fn;
}

function maxFpsFor(source) {
  let m = 0;
  for (const { fps } of state[source].subs.values()) {
    if (fps > m) m = fps;
  }
  return m;
}

function intervalForFps(fps) {
  // Cap at 16ms (~60fps); never go below that even if a subscriber asks for
  // 120fps — webContents.capturePage() can't keep up reliably at higher
  // rates and the GPU readback would dominate the main process.
  return Math.max(16, Math.round(1000 / Math.max(1, fps)));
}

function startOrUpdateTimer(source) {
  const s = state[source];
  if (!s) return;
  const fps = maxFpsFor(source);
  if (fps === 0) {
    if (s.timer) {
      clearInterval(s.timer);
      s.timer = null;
      s.timerFps = 0;
    }
    return;
  }
  if (s.timer && s.timerFps === fps) return;
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.timerFps = fps;
  s.timer = setInterval(() => tick(source), intervalForFps(fps));
}

async function tick(source) {
  const s = state[source];
  if (!s || !s.win || s.win.isDestroyed() || s.subs.size === 0) return;
  let image;
  try {
    image = await s.win.webContents.capturePage();
  } catch (_e) {
    return;
  }
  if (!image || image.isEmpty()) return;
  let size = image.getSize();
  if (size.width !== NDI_WIDTH || size.height !== NDI_HEIGHT) {
    image = image.resize({ width: NDI_WIDTH, height: NDI_HEIGHT, quality: "better" });
    size = image.getSize();
  }
  const buf = image.getBitmap();
  s.frameCount++;
  if (s.frameCount === 1 || s.frameCount % 600 === 0) {
    console.log(`[frameSource] ${source} frame #${s.frameCount} ${size.width}x${size.height} subs=${s.subs.size}`);
  }
  for (const sub of s.subs.values()) {
    try {
      sub.cb({ buffer: buf, width: size.width, height: size.height });
    } catch (err) {
      console.error(`[frameSource] subscriber error on ${source}:`, err && err.message ? err.message : err);
    }
  }
}

// Open the offscreen window for a source by asking the renderer to
// `window.open()` it. Returns a promise that resolves once
// `attachWindow()` has been called (from main.cjs's did-create-window
// handler, which calls handleChildWindow().attach(win)).
function ensureOpen(source) {
  const s = state[source];
  if (!s) return Promise.reject(new Error(`unknown source: ${source}`));
  if (s.win && !s.win.isDestroyed()) return Promise.resolve();
  if (s.opening) return s.opening;

  if (typeof getMainWindow !== "function") {
    return Promise.reject(new Error("[frameSource] no main window provider configured"));
  }
  const mainWin = getMainWindow();
  if (!mainWin || mainWin.isDestroyed()) {
    return Promise.reject(new Error("[frameSource] main window not available"));
  }

  const cfg = SOURCES[source];
  const winName = `__ltFrameSource_${source}`;

  s.opening = (async () => {
    await mainWin.webContents.executeJavaScript(`
      (function() {
        try {
          if (window['${winName}'] && !window['${winName}'].closed) window['${winName}'].close();
        } catch (e) {}
        window['${winName}'] = window.open(${JSON.stringify(cfg.route)}, ${JSON.stringify(cfg.frameName)});
      })();
    `);
    // Wait briefly for did-create-window to fire and attachWindow() to land.
    const start = Date.now();
    while ((!s.win || s.win.isDestroyed()) && Date.now() - start < 5000) {
      await new Promise(r => setTimeout(r, 50));
    }
    s.opening = null;
    if (!s.win || s.win.isDestroyed()) {
      throw new Error(`[frameSource] timed out waiting for ${source} window to open`);
    }
  })();

  return s.opening;
}

// Closes the renderer-side window.open reference for a source. Called when
// the last subscriber leaves.
async function closeIfIdle(source) {
  const s = state[source];
  if (!s || s.subs.size > 0) return;
  if (s.timer) { clearInterval(s.timer); s.timer = null; s.timerFps = 0; }

  if (typeof getMainWindow === "function") {
    const mainWin = getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      const winName = `__ltFrameSource_${source}`;
      try {
        await mainWin.webContents.executeJavaScript(`
          (function() {
            try { if (window['${winName}']) window['${winName}'].close(); } catch (e) {}
            window['${winName}'] = null;
          })();
        `);
      } catch (_e) { /* ignore */ }
    }
  }

  if (s.win && !s.win.isDestroyed()) {
    try { s.win.close(); } catch (_e) { /* ignore */ }
  }
  s.win = null;
  s.frameCount = 0;
}

// Subscribe to a source's frame stream. Triggers the offscreen window to
// open if it isn't already. Returns an async unsubscribe function.
function subscribe(source, fps, cb) {
  if (!SOURCES[source]) throw new Error(`unknown source: ${source}`);
  if (typeof cb !== "function") throw new Error("subscribe(source, fps, cb): cb must be a function");
  const s = state[source];
  const id = nextSubId++;
  s.subs.set(id, { fps: Math.max(1, fps | 0), cb });

  // Fire-and-forget the ensureOpen — once the window is attached, the timer
  // will start ticking and the subscriber callbacks will fire.
  ensureOpen(source).then(() => {
    startOrUpdateTimer(source);
  }).catch(err => {
    console.error(`[frameSource] ensureOpen(${source}) failed:`, err && err.message ? err.message : err);
  });

  // If the window's already open, re-evaluate the timer rate immediately so
  // a higher-fps subscriber promotes the loop without waiting for the next
  // ensureOpen round-trip.
  if (s.win && !s.win.isDestroyed()) {
    startOrUpdateTimer(source);
  }

  let unsubscribed = false;
  return async () => {
    if (unsubscribed) return;
    unsubscribed = true;
    s.subs.delete(id);
    if (s.subs.size === 0) {
      await closeIfIdle(source);
    } else {
      // Recompute rate (a slower remaining sub may demote the timer).
      startOrUpdateTimer(source);
    }
  };
}

// Returns the BrowserWindow constructor options for an offscreen source
// window when main.cjs's setWindowOpenHandler asks. Returns null if the
// frameName isn't one of ours — main.cjs falls through to its default
// popup behaviour in that case.
function handleChildWindow(frameName) {
  const source = LEGACY_FRAME_NAMES[frameName] ||
    (frameName === SOURCES.feed1.frameName ? "feed1" :
     frameName === SOURCES.filter1.frameName ? "filter1" : null);
  if (!source) return null;

  return {
    source,
    overrideBrowserWindowOptions: {
      show: false,
      width: NDI_WIDTH,
      height: NDI_HEIGHT,
      useContentSize: true,
      frame: false,
      backgroundColor: "#000000",
      paintWhenInitiallyHidden: true,
      fullscreenable: false,
      simpleFullscreen: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      focusable: false,
      hasShadow: false,
      titleBarStyle: "hidden",
      alwaysOnTop: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, "preload.cjs"),
      },
    },
    attach: (win) => attachWindow(source, win),
  };
}

// main.cjs invokes this from its did-create-window listener. We register
// the BrowserWindow + apply the same fullscreen-block + cosmetic-CSS
// hardening that ndiSender.cjs used to apply.
function attachWindow(source, win) {
  const s = state[source];
  if (!s) return;
  s.win = win;
  s.frameCount = 0;

  // Hard-block any attempt by the page to go fullscreen.
  win.on("enter-full-screen", () => { try { win.setFullScreen(false); } catch (_e) {} });
  win.on("enter-html-full-screen", () => { try { win.setFullScreen(false); } catch (_e) {} });
  try { win.setFullScreenable(false); } catch (_e) {}

  win.webContents.on("dom-ready", async () => {
    try {
      await win.webContents.executeJavaScript(`
        (function() {
          try {
            var noop = function() { return Promise.reject(new Error('blocked')); };
            Element.prototype.requestFullscreen = noop;
            Element.prototype.webkitRequestFullscreen = noop;
            Element.prototype.webkitRequestFullScreen = noop;
            Document.prototype.exitFullscreen = noop;
            Object.defineProperty(document, 'fullscreenElement', { get: function(){ return null; } });
            Object.defineProperty(document, 'webkitFullscreenElement', { get: function(){ return null; } });
            Object.defineProperty(document, 'fullscreenEnabled', { get: function(){ return false; } });
          } catch (e) {}

          var styleEl = document.createElement('style');
          styleEl.textContent = [
            'html, body { background:#000 !important; margin:0 !important; padding:0 !important; overflow:hidden !important; cursor:none !important; }',
            'video {',
            '  display: block !important;',
            '  visibility: visible !important;',
            '  opacity: 1 !important;',
            '  position: fixed !important;',
            '  inset: 0 !important;',
            '  top: 0 !important; left: 0 !important;',
            '  width: 100vw !important;',
            '  height: 100vh !important;',
            '  object-fit: contain !important;',
            '  background: #000 !important;',
            '  z-index: 2147483647 !important;',
            '}'
          ].join('\\n');
          document.head.appendChild(styleEl);
        })();
      `);
    } catch (_e) { /* ignore */ }
  });

  win.on("closed", () => {
    if (s.win === win) s.win = null;
    if (s.timer) { clearInterval(s.timer); s.timer = null; s.timerFps = 0; }
  });

  startOrUpdateTimer(source);
}

async function stopAll() {
  for (const source of Object.keys(state)) {
    state[source].subs.clear();
    await closeIfIdle(source);
  }
}

function status() {
  const out = {};
  for (const source of Object.keys(state)) {
    const s = state[source];
    out[source] = {
      open: !!s.win && !s.win.isDestroyed(),
      subscribers: s.subs.size,
      timerFps: s.timerFps,
      frameCount: s.frameCount,
    };
  }
  return out;
}

module.exports = {
  setMainWindowProvider,
  handleChildWindow,
  subscribe,
  ensureOpen,
  stopAll,
  status,
  WIDTH: NDI_WIDTH,
  HEIGHT: NDI_HEIGHT,
};
