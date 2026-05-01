const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ltElectron", {
  triggerUpdate: () => ipcRenderer.send("trigger-update"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  ndi: {
    status: () => ipcRenderer.invoke("ndi:status"),
    start: () => ipcRenderer.invoke("ndi:start"),
    stop: () => ipcRenderer.invoke("ndi:stop"),
  },
  // Native Blackmagic DeckLink output (Duo 2 enumerates as 4 devices on
  // macOS — one per SDI BNC). Fed by the same offscreen capturePage()
  // pipeline as NDI; see electron/decklinkOutput.cjs.
  decklink: {
    enumerate: () => ipcRenderer.invoke("decklink:enumerate"),
    status: () => ipcRenderer.invoke("decklink:status"),
    start: (deviceId, source) => ipcRenderer.invoke("decklink:start", deviceId, source),
    stop: (deviceId) => ipcRenderer.invoke("decklink:stop", deviceId),
    onDevicesChanged: (cb) => {
      const listener = (_e, devices) => { try { cb(devices); } catch (_) {} };
      ipcRenderer.on("decklink:devices-changed", listener);
      return () => { try { ipcRenderer.removeListener("decklink:devices-changed", listener); } catch (_) {} };
    },
  },
  // Tier C1: native ffmpeg binary, used by the Export page when available.
  // When ffmpegNative returns null (no binary installed), the Export code
  // falls back to ffmpeg-wasm via the existing gb()/ai path in the bundle.
  ffmpeg: {
    detect: () => ipcRenderer.invoke("ffmpeg:detect"),
    init: (sessionId) => ipcRenderer.invoke("ffmpeg:init", sessionId),
    writeFrame: (sessionId, index, buf) =>
      ipcRenderer.invoke("ffmpeg:writeFrame", sessionId, index, buf),
    run: (sessionId, args, outName) =>
      ipcRenderer.invoke("ffmpeg:run", sessionId, args, outName),
    cleanup: (sessionId) => ipcRenderer.invoke("ffmpeg:cleanup", sessionId),
    // Subscribe to progress for a given session. Returns an unsubscribe fn.
    onProgress: (sessionId, cb) => {
      const ch = `ffmpeg:progress:${sessionId}`;
      const listener = (_e, sec) => { try { cb(sec); } catch (_) {} };
      ipcRenderer.on(ch, listener);
      return () => { try { ipcRenderer.removeListener(ch, listener); } catch (_) {} };
    },
  },
});
