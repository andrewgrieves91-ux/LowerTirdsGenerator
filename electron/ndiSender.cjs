const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let ndi = null;
let loadError = null;
try {
  ndi = require(path.join(__dirname, "native", "ndi-sender"));
} catch (err) {
  loadError = err && err.message ? err.message : String(err);
}

const FILL_NAME = "LTG Fill";
const KEY_NAME = "LTG Key";
const TARGET_FPS = 60;

const NDI_FEED1_WINDOW_NAME = "lt-ndi-feed1";
const NDI_FILTER1_WINDOW_NAME = "lt-ndi-filter1";

let fillSender = null;
let keySender = null;
let fillWindow = null;
let keyWindow = null;
let running = false;
let getMainWindow = null;

// We hook setWindowOpenHandler from main.cjs. When the main window calls
// window.open() with one of our NDI_* frame names, main.cjs inspects this
// registry to decide whether the child window should be an offscreen sender
// and which NDI sender to wire up.
const pendingSubscribers = {};

function setMainWindowProvider(fn) {
  getMainWindow = fn;
}

function isAvailable() {
  return !!(ndi && typeof ndi.isSupported === "function" && ndi.isSupported());
}

function status() {
  return {
    available: isAvailable(),
    running,
    loadError,
    fill: !!fillSender,
    key: !!keySender,
    fillWindow: !!fillWindow && !fillWindow.isDestroyed(),
    keyWindow: !!keyWindow && !keyWindow.isDestroyed(),
    version: ndi && typeof ndi.version === "function" ? ndi.version() : null,
  };
}

const captureTimers = new WeakMap();
const NDI_WIDTH = 1920;
const NDI_HEIGHT = 1080;

function subscribeFrames(win, sender, label) {
  let frameCount = 0;
  const intervalMs = Math.max(16, Math.round(1000 / TARGET_FPS));
  const timer = setInterval(async () => {
    if (!running || !sender || win.isDestroyed()) return;
    try {
      let image = await win.webContents.capturePage();
      if (image.isEmpty()) return;
      let size = image.getSize();
      if (size.width !== NDI_WIDTH || size.height !== NDI_HEIGHT) {
        image = image.resize({ width: NDI_WIDTH, height: NDI_HEIGHT, quality: "better" });
        size = image.getSize();
      }
      const buf = image.getBitmap();
      sender.sendVideo(buf, size.width, size.height, TARGET_FPS);
      frameCount++;
      if (frameCount === 1 || frameCount % 120 === 0) {
        console.log(`[ndi] ${label} frame #${frameCount} ${size.width}x${size.height}`);
      }
    } catch (err) {
      if (frameCount === 0) {
        console.error(`[ndi] ${label} capture failed:`, err && err.message ? err.message : err);
      }
    }
  }, intervalMs);
  captureTimers.set(win, timer);
  win.on("closed", () => {
    const t = captureTimers.get(win);
    if (t) { clearInterval(t); captureTimers.delete(win); }
  });
}

// main.cjs calls this inside setWindowOpenHandler for child windows.
// Returns null if the frameName isn't one of ours. Otherwise returns
// BrowserWindow options + a callback to attach frame capture once the
// child window's BrowserWindow has been created.
function handleChildWindow(frameName) {
  if (frameName !== NDI_FEED1_WINDOW_NAME && frameName !== NDI_FILTER1_WINDOW_NAME) {
    return null;
  }
  const isFill = frameName === NDI_FEED1_WINDOW_NAME;
  const label = isFill ? "fill" : "key";

  return {
    overrideBrowserWindowOptions: {
      show: false,
      width: 1920,
      height: 1080,
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
    attach: (win) => {
      const sender = isFill ? fillSender : keySender;
      if (!sender) return;

      // Hard-block any attempt by the page to go fullscreen.
      win.on("enter-full-screen", () => { try { win.setFullScreen(false); } catch (_e) {} });
      win.on("enter-html-full-screen", () => { try { win.setFullScreen(false); } catch (_e) {} });
      win.setFullScreenable(false);
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

              // Strategy: cover UI chrome by forcing the <video> element to
              // the top of the z-stack as a full-viewport layer. The "click
              // to go fullscreen" overlay and any other UI stays in the DOM
              // (so the bundle keeps working) but sits invisibly behind the
              // video.
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

      subscribeFrames(win, sender, label);
      if (isFill) fillWindow = win; else keyWindow = win;
      win.on("closed", () => {
        if (win === fillWindow) fillWindow = null;
        if (win === keyWindow) keyWindow = null;
      });
    },
  };
}

async function start() {
  if (!isAvailable()) {
    console.log("[ndi] sender unavailable:", loadError || "native module not loaded");
    return false;
  }
  if (running) return true;
  if (typeof getMainWindow !== "function") {
    console.error("[ndi] no main window provider configured");
    return false;
  }
  const mainWin = getMainWindow();
  if (!mainWin || mainWin.isDestroyed()) {
    console.error("[ndi] main window not available");
    return false;
  }

  try {
    fillSender = new ndi.Sender(FILL_NAME);
    keySender = new ndi.Sender(KEY_NAME);

    running = true;

    // Ask the renderer to open the two pop-outs. Using window.open from the
    // renderer ensures each child window gets window.opener = main window,
    // which is how the pop-outs pull the MediaStream from the main Live page.
    await mainWin.webContents.executeJavaScript(`
      (function() {
        try {
          if (window.__ltNdiFeed1 && !window.__ltNdiFeed1.closed) window.__ltNdiFeed1.close();
          if (window.__ltNdiFilter1 && !window.__ltNdiFilter1.closed) window.__ltNdiFilter1.close();
        } catch (e) {}
        window.__ltNdiFeed1 = window.open('/feed1', '${NDI_FEED1_WINDOW_NAME}');
        window.__ltNdiFilter1 = window.open('/filter1', '${NDI_FILTER1_WINDOW_NAME}');
      })();
    `);

    console.log(`[ndi] started: "${FILL_NAME}" + "${KEY_NAME}" (SDK ${ndi.version()})`);
    return true;
  } catch (err) {
    console.error("[ndi] failed to start:", err && err.message ? err.message : err);
    await stop();
    return false;
  }
}

async function stop() {
  running = false;
  try { if (fillWindow && !fillWindow.isDestroyed()) fillWindow.close(); } catch (_e) { /* ignore */ }
  try { if (keyWindow && !keyWindow.isDestroyed()) keyWindow.close(); } catch (_e) { /* ignore */ }
  fillWindow = null;
  keyWindow = null;

  // Also tell the renderer to close its window.open references.
  try {
    if (typeof getMainWindow === "function") {
      const mainWin = getMainWindow();
      if (mainWin && !mainWin.isDestroyed()) {
        await mainWin.webContents.executeJavaScript(`
          (function() {
            try { if (window.__ltNdiFeed1) window.__ltNdiFeed1.close(); } catch (e) {}
            try { if (window.__ltNdiFilter1) window.__ltNdiFilter1.close(); } catch (e) {}
            window.__ltNdiFeed1 = null;
            window.__ltNdiFilter1 = null;
          })();
        `);
      }
    }
  } catch (_e) { /* ignore */ }

  const a = fillSender, b = keySender;
  fillSender = null;
  keySender = null;
  try { if (a) a.destroy(); } catch (_e) { /* ignore */ }
  try { if (b) b.destroy(); } catch (_e) { /* ignore */ }
}

const SETTINGS_FILENAME = "ndi-settings.json";
function settingsPath() {
  try {
    return path.join(app.getPath("userData"), SETTINGS_FILENAME);
  } catch (_e) {
    return null;
  }
}

function loadEnabled() {
  const p = settingsPath();
  if (!p) return false;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const o = JSON.parse(raw);
    return !!(o && o.enabled);
  } catch (_e) {
    return false;
  }
}

function saveEnabled(enabled) {
  const p = settingsPath();
  if (!p) return;
  try {
    fs.writeFileSync(p, JSON.stringify({ enabled: !!enabled }, null, 2), "utf8");
  } catch (err) {
    console.error("[ndi] failed to persist settings:", err && err.message ? err.message : err);
  }
}

module.exports = {
  isAvailable,
  status,
  start,
  stop,
  setMainWindowProvider,
  loadEnabled,
  saveEnabled,
  handleChildWindow,
};
