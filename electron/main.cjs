const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { createServer } = require("http");
const path = require("path");
const { checkForUpdates } = require("./updater.cjs");
const frameSource = require("./frameSource.cjs");
const ndi = require("./ndiSender.cjs");
const decklink = require("./decklinkOutput.cjs");
const ffmpegNative = require("./ffmpegNative.cjs");

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

  frameSource.setMainWindowProvider(() => mainWindow);

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
      const offscreen = frameSource.handleChildWindow(frameName);
      if (offscreen) {
        console.log(`[main] frameSource child window matched: ${frameName} (source=${offscreen.source})`);
        return {
          action: "allow",
          overrideBrowserWindowOptions: offscreen.overrideBrowserWindowOptions,
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

  mainWindow.webContents.on("did-create-window", (childWindow, details) => {
    console.log(`[main] did-create-window: frameName="${details.frameName}" url=${details.url}`);
    const offscreen = frameSource.handleChildWindow(details.frameName);
    if (offscreen && typeof offscreen.attach === "function") {
      console.log(`[main] attaching frameSource source ${offscreen.source} to child window`);
      offscreen.attach(childWindow);
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

  // ─── DeckLink SDI output (Duo 2) ───
  ipcMain.handle("decklink:enumerate", () => decklink.enumerate());
  ipcMain.handle("decklink:status", () => decklink.status());
  ipcMain.handle("decklink:start", async (_e, deviceId, source) => {
    return await decklink.start(deviceId, source);
  });
  ipcMain.handle("decklink:stop", async (_e, deviceId) => {
    return await decklink.stop(deviceId);
  });
  if (decklink.isAvailable()) {
    decklink.startPolling();
    console.log("[decklink] device polling started");
  } else {
    const s = decklink.status();
    console.log("[decklink] unavailable:", s.loadError || "native addon not loaded");
  }

  // ─── Native ffmpeg (Export page) — Tier C1 ───
  ipcMain.handle("ffmpeg:detect", () => {
    return ffmpegNative.detectFFmpeg() ? true : false;
  });
  ipcMain.handle("ffmpeg:init", (_e, sessionId) => {
    try { return { ok: true, ...ffmpegNative.initSession(sessionId) }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle("ffmpeg:writeFrame", (_e, sessionId, index, buf) => {
    try { ffmpegNative.writeFrame(sessionId, index, buf); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle("ffmpeg:run", async (_e, sessionId, args, outName) => {
    const progressChannel = `ffmpeg:progress:${sessionId}`;
    try {
      const buf = await ffmpegNative.runFFmpeg(sessionId, args, outName, (sec) => {
        try { mainWindow?.webContents?.send(progressChannel, sec); } catch (_) {}
      });
      // Transfer as ArrayBuffer-backed Uint8Array for renderer
      return { ok: true, buffer: buf };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle("ffmpeg:cleanup", (_e, sessionId) => {
    try { ffmpegNative.cleanup(sessionId); return { ok: true }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
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
  try { decklink.stopPolling(); } catch { /* ignore */ }
  try { await decklink.stopAll(); } catch { /* ignore */ }
  try { await ndi.stop(); } catch { /* ignore */ }
  try { await frameSource.stopAll(); } catch { /* ignore */ }
  httpServer?.close();
});

app.on("window-all-closed", () => app.quit());
