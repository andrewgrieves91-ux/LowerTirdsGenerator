import { createServer } from "http";
import { createApp } from "./app.js";
import { checkOnStartup } from "./updater.js";

const DEFAULT_PORT = 3000;
const LISTEN_HOST = "0.0.0.0";

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  const startPort = Number(process.env.PORT || DEFAULT_PORT);

  const port = await new Promise((resolve, reject) => {
    let current = startPort;

    function tryPort() {
      if (current > startPort + 100) {
        reject(new Error(`No free port found (tried ${startPort}–${current})`));
        return;
      }
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.log(`Port ${current} in use, trying ${current + 1}…`);
          current++;
          tryPort();
        } else {
          reject(err);
        }
      });
      server.listen(current, LISTEN_HOST, () => resolve(current));
    }

    tryPort();
  });

  console.log(`Server running on http://localhost:${port}/`);
  console.log(
    `Companion API available at http://localhost:${port}/api/companion`,
  );
  checkOnStartup();
}

startServer().catch(console.error);
