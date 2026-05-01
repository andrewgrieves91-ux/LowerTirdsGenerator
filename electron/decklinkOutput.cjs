// decklinkOutput.cjs
//
// Main-process orchestrator for the native DeckLink output addon.
// Mirrors the shape of ndiSender.cjs but for SDI playback via the
// Blackmagic DeckLink card. The DeckLink Duo 2 enumerates as 4 separate
// IDeckLink instances (one per SDI BNC); each one is a possible
// `deviceId` here.
//
// Frame data comes from frameSource.cjs — the same offscreen window
// pipeline that feeds NDI. So enabling NDI Fill+Key alongside several
// DeckLink outputs is just a fan-out: one capture per source, multiple
// subscribers consuming the BGRA bitmap.

const path = require("path");
const { BrowserWindow } = require("electron");
const frameSource = require("./frameSource.cjs");

let decklink = null;
let loadError = null;
try {
  decklink = require(path.join(__dirname, "native", "decklink-output"));
} catch (err) {
  loadError = err && err.message ? err.message : String(err);
}

const TARGET_FPS = 50;
const TARGET_MODE = "HD1080p50";

// Map<deviceId, { sender, unsubscribe, source }>
const active = new Map();

let lastDevicesJson = "[]";
let pollTimer = null;
const POLL_MS = 2000;

function isAvailable() {
  if (!decklink) return false;
  try { return !!decklink.isSupported(); }
  catch { return false; }
}

function enumerate() {
  if (!decklink) return [];
  try {
    const list = decklink.enumerate();
    if (!Array.isArray(list)) return [];
    return list.map((d, i) => ({
      deviceId: String(d.deviceId || d.displayName || `decklink-${i}`),
      modelName: String(d.modelName || ""),
      displayName: String(d.displayName || d.deviceId || `DeckLink ${i + 1}`),
      supportsOutput: !!d.supportsOutput,
      index: typeof d.index === "number" ? d.index : i,
    }));
  } catch (err) {
    console.error("[decklink] enumerate failed:", err && err.message ? err.message : err);
    return [];
  }
}

async function start(deviceId, source) {
  if (!isAvailable()) {
    console.log("[decklink] unavailable:", loadError || "native addon not loaded");
    return { ok: false, error: loadError || "native addon not loaded" };
  }
  if (typeof deviceId !== "string" || !deviceId.length) {
    return { ok: false, error: "deviceId is required" };
  }
  if (source !== "feed1" && source !== "filter1") {
    return { ok: false, error: `invalid source '${source}' — must be 'feed1' or 'filter1'` };
  }
  if (active.has(deviceId)) {
    // Idempotent: if the same deviceId is started for the same source we
    // treat it as a no-op; if for a different source we re-bind.
    const existing = active.get(deviceId);
    if (existing.source === source) return { ok: true, alreadyRunning: true };
    await stop(deviceId);
  }

  let sender;
  try {
    sender = new decklink.Sender(deviceId, TARGET_MODE);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error(`[decklink] Sender(${deviceId}) failed:`, msg);
    return { ok: false, error: msg };
  }

  const unsubscribe = frameSource.subscribe(source, TARGET_FPS, ({ buffer, width, height }) => {
    try { sender.sendFrame(buffer, width, height); }
    catch (err) {
      console.error(`[decklink] ${deviceId} sendFrame failed:`, err && err.message ? err.message : err);
    }
  });

  active.set(deviceId, { sender, unsubscribe, source });
  console.log(`[decklink] started ${deviceId} <- ${source} @ ${TARGET_MODE}`);
  return { ok: true };
}

async function stop(deviceId) {
  const entry = active.get(deviceId);
  if (!entry) return { ok: true, alreadyStopped: true };
  active.delete(deviceId);
  try { if (entry.unsubscribe) await entry.unsubscribe(); }
  catch (err) { console.error("[decklink] unsubscribe failed:", err && err.message ? err.message : err); }
  try { entry.sender.destroy(); }
  catch (err) { console.error("[decklink] destroy failed:", err && err.message ? err.message : err); }
  console.log(`[decklink] stopped ${deviceId}`);
  return { ok: true };
}

async function stopAll() {
  const ids = Array.from(active.keys());
  for (const id of ids) {
    try { await stop(id); } catch (_e) { /* ignore */ }
  }
}

function status() {
  return {
    available: isAvailable(),
    loadError,
    devices: enumerate(),
    active: Array.from(active.entries()).map(([deviceId, { source }]) => ({ deviceId, source })),
    mode: TARGET_MODE,
    fps: TARGET_FPS,
    version: decklink && typeof decklink.version === "function" ? safeVersion() : null,
  };
}

function safeVersion() {
  try { return decklink.version(); } catch { return null; }
}

// Broadcasts the current device list to all renderer windows so the Live
// page's overlay can refresh its dropdown when devices are hot-plugged.
function broadcastDevicesChanged(devices) {
  const wins = BrowserWindow.getAllWindows();
  for (const w of wins) {
    try {
      if (w && !w.isDestroyed() && w.webContents) {
        w.webContents.send("decklink:devices-changed", devices);
      }
    } catch (_e) { /* ignore */ }
  }
}

function startPolling() {
  if (pollTimer) return;
  if (!isAvailable()) return;
  // Emit an initial snapshot synchronously so renderers that subscribed
  // before polling started still see the current device list.
  const initial = enumerate();
  lastDevicesJson = JSON.stringify(initial);
  pollTimer = setInterval(() => {
    const cur = enumerate();
    const json = JSON.stringify(cur);
    if (json !== lastDevicesJson) {
      lastDevicesJson = json;
      console.log(`[decklink] device list changed: ${cur.length} device(s)`);

      // Stop senders whose device disappeared so we don't keep pushing
      // frames into a card that's been unplugged.
      const present = new Set(cur.map(d => d.deviceId));
      for (const id of Array.from(active.keys())) {
        if (!present.has(id)) {
          stop(id).catch(_e => {});
        }
      }

      broadcastDevicesChanged(cur);
    }
  }, POLL_MS);
  if (pollTimer.unref) pollTimer.unref();
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

module.exports = {
  isAvailable,
  enumerate,
  start,
  stop,
  stopAll,
  status,
  startPolling,
  stopPolling,
};
