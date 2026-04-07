const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ltElectron", {
  triggerUpdate: () => ipcRenderer.send("trigger-update"),
});
