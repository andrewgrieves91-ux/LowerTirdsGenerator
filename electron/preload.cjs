const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ltElectron", {
  triggerUpdate: () => ipcRenderer.send("trigger-update"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  ndi: {
    status: () => ipcRenderer.invoke("ndi:status"),
    start: () => ipcRenderer.invoke("ndi:start"),
    stop: () => ipcRenderer.invoke("ndi:stop"),
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
