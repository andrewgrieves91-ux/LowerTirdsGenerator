const { app, BrowserWindow, Menu } = require("electron");
const { createServer } = require("http");
const net = require("net");

let mainWindow;
let httpServer;
let serverPort;

function findFreePort(port = 3000) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(port, () => srv.close(() => resolve(port)));
    srv.on("error", () => resolve(findFreePort(port + 1)));
  });
}

app.whenReady().then(async () => {
  serverPort = await findFreePort(3000);
  process.env.PORT = String(serverPort);

  const { createApp } = await import("../server/app.js");
  const expressApp = createApp();
  httpServer = createServer(expressApp);

  await new Promise((resolve) => {
    httpServer.listen(serverPort, "0.0.0.0", resolve);
  });
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
