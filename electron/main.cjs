const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { createServer } = require("http");
const path = require("path");
const { checkForUpdates } = require("./updater.js");
const ndi = require("./ndiSender.cjs");

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");

if (!app.isPackaged) {
  app.commandLine.appendSwitch("no-sandbox");
}

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

function buildMenu(ndiEnabled) {
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
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          id: "ndi-toggle",
          label: "NDI Output (LTG Fill + LTG Key)",
          type: "checkbox",
          checked: !!ndiEnabled,
          enabled: ndi.isAvailable(),
          click: async (item) => {
            const want = item.checked;
            if (want) {
              const ok = await ndi.start();
              if (!ok) item.checked = false;
              ndi.saveEnabled(!!ok);
            } else {
              await ndi.stop();
              ndi.saveEnabled(false);
            }
            rebuildMenu();
          },
        },
      ],
    },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}

function rebuildMenu() {
  const enabled = ndi.status().running;
  Menu.setApplicationMenu(buildMenu(enabled));
}

app.whenReady().then(async () => {
  process.env.LT_DATA_DIR = app.getPath("userData");
  const { createApp } = await import("../server/app.js");
  const expressApp = createApp();
  httpServer = createServer(expressApp);

  serverPort = await listenOnFreePort(httpServer, 3000);
  process.env.PORT = String(serverPort);
  expressApp.set("port", serverPort);
  console.log(`Express running on http://localhost:${serverPort}`);

  ndi.setMainWindowProvider(() => mainWindow);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Lower Thirds Generator",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    console.log(`[main] setWindowOpenHandler: url=${url} frameName="${frameName}"`);
    if (url.startsWith("http://localhost") || url.startsWith("file://")) {
      const ndiChild = ndi.handleChildWindow(frameName);
      if (ndiChild) {
        console.log(`[main] NDI child window matched: ${frameName}`);
        return {
          action: "allow",
          overrideBrowserWindowOptions: ndiChild.overrideBrowserWindowOptions,
        };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.cjs"),
            backgroundThrottling: false,
          },
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // When a child window is actually created, attach frame capture if it's ours.
  mainWindow.webContents.on("did-create-window", (childWindow, details) => {
    console.log(`[main] did-create-window: frameName="${details.frameName}" url=${details.url}`);
    const ndiChild = ndi.handleChildWindow(details.frameName);
    if (ndiChild && typeof ndiChild.attach === "function") {
      console.log(`[main] attaching NDI frame capture to child window ${details.frameName}`);
      ndiChild.attach(childWindow);
    }
  });

  Menu.setApplicationMenu(buildMenu(false));

  ipcMain.on("trigger-update", () => checkForUpdates(false));
  ipcMain.on("open-external", (_e, url) => {
    if (typeof url === "string" && url.startsWith("http")) {
      shell.openExternal(url);
    }
  });
  ipcMain.handle("ndi:status", () => ndi.status());
  ipcMain.handle("ndi:start", async () => {
    const ok = await ndi.start();
    ndi.saveEnabled(!!ok);
    rebuildMenu();
    return ok;
  });
  ipcMain.handle("ndi:stop", async () => {
    await ndi.stop();
    ndi.saveEnabled(false);
    rebuildMenu();
    return true;
  });

  if (ndi.isAvailable() && ndi.loadEnabled()) {
    console.log("[ndi] auto-start queued, waiting for main window to finish loading");
    mainWindow.webContents.once("did-finish-load", async () => {
      console.log("[ndi] main window loaded, auto-starting from saved preference");
      const ok = await ndi.start();
      if (ok) rebuildMenu();
    });
  } else if (!ndi.isAvailable()) {
    const s = ndi.status();
    console.log("[ndi] module unavailable:", s.loadError || "native addon not loaded");
  } else {
    console.log("[ndi] available but disabled (toggle via View menu to enable)");
  }

  setTimeout(() => checkForUpdates(true), 15000);
});

app.on("before-quit", async () => {
  try { await ndi.stop(); } catch (err) { /* ignore */ }
  httpServer?.close();
});

app.on("window-all-closed", () => app.quit());
