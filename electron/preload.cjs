const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ltElectron", {
  triggerUpdate: () => ipcRenderer.send("trigger-update"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  ndi: {
    status: () => ipcRenderer.invoke("ndi:status"),
    start: () => ipcRenderer.invoke("ndi:start"),
    stop: () => ipcRenderer.invoke("ndi:stop"),
  },
});
