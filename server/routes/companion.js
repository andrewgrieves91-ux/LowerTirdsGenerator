import { Router } from "express";
import {
  dispatchCommand,
  getPendingCommand,
  acknowledgeCommand,
  getTally,
  setTally,
  getCommandSeq,
  getCues,
  setCues,
  loadCuesFromDisk,
  getCompanionApiUrl,
  setCompanionApiUrl,
  getGridLayout,
  getGridSize,
  setGridLayout,
  setGridSize,
} from "../state/companionState.js";
import {
  cueNumberParam,
  tallyArraySchema,
  ackBodySchema,
} from "../validation.js";
import { generateCompanionConfig } from "../companionConfig.js";
import {
  buildSyncPayload,
  pushToCompanion,
  getStatus,
  getTallyByNumber,
} from "../services/companion.js";

const router = Router();

// --- Command dispatch ---

router.post("/select/:cueNumber", (req, res) => {
  const r = cueNumberParam.safeParse(req.params.cueNumber);
  if (!r.success) return res.status(400).json({ ok: false, error: "Invalid cue number" });
  dispatchCommand(res, { type: "select", cueNumber: r.data });
});

router.post("/select-play/:cueNumber", (req, res) => {
  const r = cueNumberParam.safeParse(req.params.cueNumber);
  if (!r.success) return res.status(400).json({ ok: false, error: "Invalid cue number" });
  dispatchCommand(res, { type: "select_and_play", cueNumber: r.data });
});

router.post("/play",         (_req, res) => dispatchCommand(res, { type: "play" }));
router.post("/reset",        (_req, res) => dispatchCommand(res, { type: "reset" }));
router.post("/clear-status", (_req, res) => dispatchCommand(res, { type: "clear_status" }));
router.post("/next",         (_req, res) => dispatchCommand(res, { type: "next_cue" }));
router.post("/prev",         (_req, res) => dispatchCommand(res, { type: "prev_cue" }));

// --- Tally ---

router.get("/tally", (_req, res) => {
  const tally = getTally();
  res.json({
    tally,
    tallyByNumber: getTallyByNumber(tally),
    anyLive: tally.some((t) => t.tally === "live"),
    commandSeq: getCommandSeq(),
    pendingCommand: getPendingCommand().pendingCommand,
  });
});

router.get("/tally/:cueNumber", (req, res) => {
  const r = cueNumberParam.safeParse(req.params.cueNumber);
  if (!r.success) return res.status(400).send("off");
  const entry = getTally().find((t) => t.cueNumber === r.data);
  res.type("text/plain").send(entry?.tally ?? "off");
});

router.post("/tally", (req, res) => {
  const r = tallyArraySchema.safeParse(req.body?.tally);
  if (!r.success) {
    return res.status(400).json({
      ok: false,
      error: "tally must be an array of { cueNumber: number, tally: 'live'|'selected'|'played'|'off' }",
    });
  }
  setTally(r.data);
  res.json({ ok: true });
});

// --- Poll/ack lifecycle ---

router.get("/poll", (_req, res) => res.json(getPendingCommand()));

router.post("/ack", (req, res) => {
  const r = ackBodySchema.safeParse(req.body);
  if (r.success) acknowledgeCommand(r.data.seq);
  res.json({ ok: true });
});

// --- Status ---

router.get("/status", (_req, res) => {
  res.json(getStatus(getTally(), getCommandSeq()));
});

// --- Sync to a remote Companion instance ---
//
// Companion's HTTP Remote Control API only mutates existing buttons; it cannot
// create or delete them. When cues are added or removed, the response steers
// the user to re-import the .companionconfig file.
router.post("/sync", async (req, res) => {
  let cues;
  if (Array.isArray(req.body?.cues) && req.body.cues.length > 0) {
    cues = req.body.cues;
    setCues(cues);
  } else {
    const diskCues = loadCuesFromDisk();
    if (diskCues.length > 0) {
      setCues(diskCues);
      cues = diskCues;
    } else {
      cues = getCues();
    }
  }

  if (cues.length === 0) {
    return res.status(400).json({ ok: false, error: "No cues stored. Open the Edit page first." });
  }

  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const companionUrl = getCompanionApiUrl();

  const payload = buildSyncPayload({
    cues,
    baseUrl,
    gridLayout: getGridLayout(),
    gridSize: getGridSize(),
  });
  const stats = await pushToCompanion(companionUrl, payload);

  const configUrl = `${baseUrl}/api/companion/config.companionconfig`;
  if (stats.stylesUpdated === 0 && stats.styleFails > 0) {
    return res.status(502).json({
      ok: false,
      error: `Could not reach Companion at ${companionUrl}. Is Companion running?`,
      configUrl,
    });
  }

  res.json({
    ok: true,
    cueCount: payload.buttons.length,
    stylesUpdated: stats.stylesUpdated,
    configUrl,
    message: `Updated ${stats.stylesUpdated} button labels. If you've added or removed cues, re-import the config file.`,
  });
});

// --- Config download ---

router.get("/config.companionconfig", (req, res) => {
  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const config = generateCompanionConfig(getCues(), baseUrl, getGridLayout(), getGridSize());
  res.setHeader("Content-Disposition", "attachment; filename=lower-thirds.companionconfig");
  res.json(config);
});

// --- Cue storage ---

router.get("/cues", (_req, res) => res.json({ cues: getCues() }));

router.post("/cues", (req, res) => {
  const { cues } = req.body;
  if (!Array.isArray(cues)) return res.status(400).json({ ok: false, error: "cues must be an array" });
  setCues(cues);
  res.json({ ok: true, count: cues.length });
});

// --- Grid layout ---

router.get("/grid-layout", (_req, res) => res.json({ layout: getGridLayout(), size: getGridSize() }));

router.put("/grid-layout", (req, res) => {
  const { layout, size } = req.body;
  if (Array.isArray(layout)) setGridLayout(layout);
  if (size && typeof size === "object") setGridSize(size);
  res.json({ ok: true });
});

// --- Companion API settings ---

router.get("/settings", (_req, res) => res.json({ companionApiUrl: getCompanionApiUrl() }));

router.put("/settings", (req, res) => {
  const { companionApiUrl } = req.body;
  if (typeof companionApiUrl === "string" && companionApiUrl.trim()) {
    setCompanionApiUrl(companionApiUrl.trim());
  }
  res.json({ ok: true, companionApiUrl: getCompanionApiUrl() });
});

export default router;
