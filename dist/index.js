// server/index.ts
import express from "express";
import { createServer } from "http";
import { networkInterfaces } from "os";
import path from "path";
import { fileURLToPath } from "url";

// server/companion.ts
import { Router } from "express";
var state = {
  pendingCommand: null,
  commandAt: 0,
  tally: [],
  commandSeq: 0
};
var router = Router();
router.post("/select/:cueNumber", (req, res) => {
  const cueNumber = parseInt(req.params.cueNumber, 10);
  if (isNaN(cueNumber) || cueNumber < 1) {
    res.status(400).json({ ok: false, error: "Invalid cue number" });
    return;
  }
  state.pendingCommand = { type: "select", cueNumber };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/play", (_req, res) => {
  state.pendingCommand = { type: "play" };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/reset", (_req, res) => {
  state.pendingCommand = { type: "reset" };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/clear-status", (_req, res) => {
  state.pendingCommand = { type: "clear_status" };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/select-play/:cueNumber", (req, res) => {
  const cueNumber = parseInt(req.params.cueNumber, 10);
  if (isNaN(cueNumber) || cueNumber < 1) {
    res.status(400).json({ ok: false, error: "Invalid cue number" });
    return;
  }
  state.pendingCommand = { type: "select_and_play", cueNumber };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/next", (_req, res) => {
  state.pendingCommand = { type: "next_cue" };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.post("/prev", (_req, res) => {
  state.pendingCommand = { type: "prev_cue" };
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command: state.pendingCommand, seq: state.commandSeq });
});
router.get("/tally", (_req, res) => {
  const tallyByNumber = {};
  for (const t of state.tally) {
    tallyByNumber[String(t.cueNumber)] = t.tally;
  }
  const anyLive = state.tally.some((t) => t.tally === "live");
  res.json({
    tally: state.tally,
    tallyByNumber,
    anyLive,
    commandSeq: state.commandSeq,
    pendingCommand: state.pendingCommand
  });
});
router.get("/tally/:cueNumber", (req, res) => {
  const cueNumber = parseInt(req.params.cueNumber, 10);
  if (isNaN(cueNumber) || cueNumber < 1) {
    res.status(400).send("off");
    return;
  }
  const entry = state.tally.find((t) => t.cueNumber === cueNumber);
  res.type("text/plain").send(entry?.tally ?? "off");
});
router.get("/poll", (_req, res) => {
  res.json({
    pendingCommand: state.pendingCommand,
    commandSeq: state.commandSeq,
    commandAt: state.commandAt
  });
});
router.post("/ack", (req, res) => {
  const seq = req.body?.seq;
  if (seq !== void 0 && seq === state.commandSeq) {
    state.pendingCommand = null;
  }
  res.json({ ok: true });
});
router.post("/tally", (req, res) => {
  const tally = req.body?.tally;
  if (!Array.isArray(tally)) {
    res.status(400).json({ ok: false, error: "tally must be an array" });
    return;
  }
  state.tally = tally;
  res.json({ ok: true });
});
router.get("/status", (_req, res) => {
  const liveCues = state.tally.filter((t) => t.tally === "live").length;
  const selCues = state.tally.filter((t) => t.tally === "selected").length;
  const playedCues = state.tally.filter((t) => t.tally === "played").length;
  res.json({
    ok: true,
    app: "Lower Thirds Generator",
    totalCues: state.tally.length,
    live: liveCues,
    selected: selCues,
    played: playedCues,
    commandSeq: state.commandSeq
  });
});
var companion_default = router;

// server/index.ts
function getLocalIPs() {
  const ifaces = networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express();
  const server = createServer(app);
  const staticPath = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : process.env.NODE_ENV === "production" ? path.resolve(__dirname, "public") : path.resolve(__dirname, "..", "dist", "public");
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/companion")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    } else {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    }
  });
  app.use(express.json());
  app.get("/api/network-info", (_req, res) => {
    const ips = getLocalIPs();
    res.json({ ips, port: Number(port) });
  });
  app.use("/api/companion", companion_default);
  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
  const port = process.env.PORT || 3e3;
  server.listen(Number(port), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`Companion API available at http://localhost:${port}/api/companion`);
  });
}
startServer().catch(console.error);
