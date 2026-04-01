const { app, BrowserWindow, Menu } = require("electron");
const { createServer } = require("http");

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
    },
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "allow" };
  });

  const template = [
    { role: "appMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});

app.on("before-quit", () => {
  httpServer?.close();
});

app.on("window-all-closed", () => app.quit());
