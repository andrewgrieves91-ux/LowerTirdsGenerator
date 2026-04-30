import express from "express";
import path from "path";
import fs from "fs";
import vm from "vm";
import { fileURLToPath } from "url";

import { headerRouter } from "./middleware/headerRouter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import companionRouter from "./routes/companion.js";
import networkRouter from "./routes/network.js";
import updateRouter from "./routes/update.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OVERLAY_PATH = path.join(__dirname, "overlay", "update-overlay.client.js");

let cachedOverlay = null;
function getOverlayScript() {
  if (cachedOverlay !== null) return cachedOverlay;
  const src = fs.readFileSync(OVERLAY_PATH, "utf-8");
  // Surface syntax errors at server startup rather than silently shipping
  // a broken SPA to the client.
  try {
    new vm.Script(src, { filename: OVERLAY_PATH });
  } catch (err) {
    throw new Error(
      `[overlay] Syntax error in ${OVERLAY_PATH}: ${err.message}`,
    );
  }
  cachedOverlay = src;
  return cachedOverlay;
}

let cachedIndexHtml = null;

function getIndexHtml(staticPath) {
  if (cachedIndexHtml) return cachedIndexHtml;

  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  const raw = fs.readFileSync(path.join(staticPath, "index.html"), "utf-8");
  const globals = `<script>window.__LT_VERSION=${JSON.stringify(pkg.version)};window.__LT_UPDATE_URL=${JSON.stringify(pkg.updateUrl || "")};</script>`;
  const overlay = `<script id="lt-update-overlay">${getOverlayScript()}</script>`;
  cachedIndexHtml = raw.replace("</body>", `${globals}\n${overlay}\n</body>`);
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
