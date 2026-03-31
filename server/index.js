import { createServer } from "http";
import { createApp } from "./app.js";
import { checkOnStartup } from "./updater.js";

const DEFAULT_PORT = 3000;
const LISTEN_HOST = "0.0.0.0";

async function startServer() {
  const app = createApp();
  const server = createServer(app);

  const port = process.env.PORT || DEFAULT_PORT;
  server.listen(Number(port), LISTEN_HOST, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(
      `Companion API available at http://localhost:${port}/api/companion`,
    );
    checkOnStartup();
  });
}

startServer().catch(console.error);
