import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { headerRouter } from "./middleware/headerRouter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import companionRouter from "./routes/companion.js";
import networkRouter from "./routes/network.js";
import updateRouter from "./routes/update.js";
import { UPDATE_OVERLAY_SCRIPT } from "./updateOverlay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedIndexHtml = null;

function getIndexHtml(staticPath) {
  if (cachedIndexHtml) return cachedIndexHtml;

  const raw = fs.readFileSync(path.join(staticPath, "index.html"), "utf-8");
  const scriptTag = `<script id="lt-update-overlay">${UPDATE_OVERLAY_SCRIPT}</script>`;
  cachedIndexHtml = raw.replace("</body>", `${scriptTag}\n</body>`);
  return cachedIndexHtml;
}

export function createApp() {
  const app = express();

  const staticPath =
    process.env.STATIC_DIR
      ? path.resolve(process.env.STATIC_DIR)
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(headerRouter);
  app.use(express.json());

  app.use("/api", networkRouter);
  app.use("/api/companion", companionRouter);
  app.use("/api/update", updateRouter);

  app.use(express.static(staticPath, { index: false }));
  app.get("*", (_req, res) => {
    const html = getIndexHtml(staticPath);
    res.type("html").send(html);
  });

  app.use(errorHandler);

  return app;
}
