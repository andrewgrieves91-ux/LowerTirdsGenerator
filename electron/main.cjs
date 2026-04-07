const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { createServer } = require("http");
const path = require("path");
const { checkForUpdates } = require("./updater.js");

let mainWindow;
let httpServer;
let serverPort;

function listenOnFreePort(server, startPort = 3000) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const maxPort = startPort + 100;

    function tryPort() {
      if (port > maxPort) {
        reject(new Error("No free port found between " + startPort + " and " + maxPort));
        return;
      }
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          port++;
          tryPort();
        } else {
          reject(err);
        }
      });
      server.listen(port, "0.0.0.0", () => resolve(port));
    }

    tryPort();
  });
}

app.whenReady().then(async () => {
  const { createApp } = await import("../server/app.js");
  const expressApp = createApp();
  httpServer = createServer(expressApp);

  serverPort = await listenOnFreePort(httpServer, 3000);
  process.env.PORT = String(serverPort);
  console.log(`Express running on http://localhost:${serverPort}`);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Lower Thirds Generator",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "allow" };
  });

  const template = [
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Check for Updates…",
          click: () => checkForUpdates(false),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  ipcMain.on("trigger-update", () => checkForUpdates(false));

  setTimeout(() => checkForUpdates(true), 3000);
});

app.on("before-quit", () => {
  httpServer?.close();
});

app.on("window-all-closed", () => app.quit());
