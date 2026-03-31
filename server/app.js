import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { headerRouter } from "./middleware/headerRouter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import companionRouter from "./routes/companion.js";
import networkRouter from "./routes/network.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  app.use(errorHandler);

  return app;
}
