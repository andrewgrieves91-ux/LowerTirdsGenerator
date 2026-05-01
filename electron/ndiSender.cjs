// ndiSender.cjs
//
// Wraps the native NDI sender addon and binds it to the shared offscreen
// frame service (frameSource.cjs). Ownership of the hidden BrowserWindows
// + capturePage timer used to live in this file; that's now centralised in
// frameSource.cjs so DeckLink and any future broadcast sink can subscribe
// to the same frame stream without opening duplicate offscreen windows.

const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const frameSource = require("./frameSource.cjs");

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

let fillSender = null;
let keySender = null;
let fillUnsub = null;
let keyUnsub = null;
let running = false;

function isAvailable() {
  return !!(ndi && typeof ndi.isSupported === "function" && ndi.isSupported());
}

function status() {
  const fs = frameSource.status();
  return {
    available: isAvailable(),
    running,
    loadError,
    fill: !!fillSender,
    key: !!keySender,
    fillWindow: !!(fs.feed1 && fs.feed1.open),
    keyWindow: !!(fs.filter1 && fs.filter1.open),
    version: ndi && typeof ndi.version === "function" ? ndi.version() : null,
  };
}

async function start() {
  if (!isAvailable()) {
    console.log("[ndi] sender unavailable:", loadError || "native module not loaded");
    return false;
  }
  if (running) return true;

  try {
    fillSender = new ndi.Sender(FILL_NAME);
    keySender = new ndi.Sender(KEY_NAME);
    running = true;

    fillUnsub = frameSource.subscribe("feed1", TARGET_FPS, ({ buffer, width, height }) => {
      if (!running || !fillSender) return;
      try { fillSender.sendVideo(buffer, width, height, TARGET_FPS); }
      catch (err) { console.error("[ndi] fill sendVideo failed:", err && err.message ? err.message : err); }
    });
    keyUnsub = frameSource.subscribe("filter1", TARGET_FPS, ({ buffer, width, height }) => {
      if (!running || !keySender) return;
      try { keySender.sendVideo(buffer, width, height, TARGET_FPS); }
      catch (err) { console.error("[ndi] key sendVideo failed:", err && err.message ? err.message : err); }
    });

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

  // Drop our subscriptions first so frameSource can close the offscreen
  // windows when no other consumer is left.
  try { if (fillUnsub) await fillUnsub(); } catch (_e) { /* ignore */ }
  try { if (keyUnsub) await keyUnsub(); } catch (_e) { /* ignore */ }
  fillUnsub = null;
  keyUnsub = null;

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
  loadEnabled,
  saveEnabled,
};
