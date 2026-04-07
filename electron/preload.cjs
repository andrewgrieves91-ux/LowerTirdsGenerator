const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ltElectron", {
  triggerUpdate: () => ipcRenderer.send("trigger-update"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
});
