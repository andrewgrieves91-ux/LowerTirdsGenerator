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
import {
  generateCompanionConfig,
  generateButtonLayout,
} from "../companionConfig.js";

const router = Router();

router.post("/select/:cueNumber", (req, res) => {
  const result = cueNumberParam.safeParse(req.params.cueNumber);
  if (!result.success) {
    res.status(400).json({ ok: false, error: "Invalid cue number" });
    return;
  }
  dispatchCommand(res, { type: "select", cueNumber: result.data });
});

router.post("/play", (_req, res) => {
  dispatchCommand(res, { type: "play" });
});

router.post("/reset", (_req, res) => {
  dispatchCommand(res, { type: "reset" });
});

router.post("/clear-status", (_req, res) => {
  dispatchCommand(res, { type: "clear_status" });
});

router.post("/select-play/:cueNumber", (req, res) => {
  const result = cueNumberParam.safeParse(req.params.cueNumber);
  if (!result.success) {
    res.status(400).json({ ok: false, error: "Invalid cue number" });
    return;
  }
  dispatchCommand(res, { type: "select_and_play", cueNumber: result.data });
});

router.post("/next", (_req, res) => {
  dispatchCommand(res, { type: "next_cue" });
});

router.post("/prev", (_req, res) => {
  dispatchCommand(res, { type: "prev_cue" });
});

router.get("/tally", (_req, res) => {
  const tally = getTally();
  const tallyByNumber = {};
  for (const t of tally) {
    tallyByNumber[String(t.cueNumber)] = t.tally;
  }
  const anyLive = tally.some((t) => t.tally === "live");
  res.json({
    tally,
    tallyByNumber,
    anyLive,
    commandSeq: getCommandSeq(),
    pendingCommand: getPendingCommand().pendingCommand,
  });
});

router.get("/tally/:cueNumber", (req, res) => {
  const result = cueNumberParam.safeParse(req.params.cueNumber);
  if (!result.success) {
    res.status(400).send("off");
    return;
  }
  const tally = getTally();
  const entry = tally.find((t) => t.cueNumber === result.data);
  res.type("text/plain").send(entry?.tally ?? "off");
});

router.get("/poll", (_req, res) => {
  res.json(getPendingCommand());
});

router.post("/ack", (req, res) => {
  const result = ackBodySchema.safeParse(req.body);
  if (result.success) {
    acknowledgeCommand(result.data.seq);
  }
  res.json({ ok: true });
});

router.post("/tally", (req, res) => {
  const result = tallyArraySchema.safeParse(req.body?.tally);
  if (!result.success) {
    res.status(400).json({
      ok: false,
      error: "tally must be an array of { cueNumber: number, tally: 'live'|'selected'|'played'|'off' }",
    });
    return;
  }
  setTally(result.data);
  res.json({ ok: true });
});

router.get("/status", (_req, res) => {
  const tally = getTally();
  const liveCues = tally.filter((t) => t.tally === "live").length;
  const selCues = tally.filter((t) => t.tally === "selected").length;
  const playedCues = tally.filter((t) => t.tally === "played").length;
  res.json({
    ok: true,
    app: "Lower Thirds Generator",
    totalCues: tally.length,
    live: liveCues,
    selected: selCues,
    played: playedCues,
    commandSeq: getCommandSeq(),
  });
});

// --- Sync to Companion ---
//
// Uses the HTTP Remote Control API to update existing button labels/styles.
// Companion's public HTTP API only supports style changes on existing buttons —
// it cannot create or delete buttons. When cues are added or removed, the
// response tells the user to re-import the .companionconfig file.

router.post("/sync", async (req, res) => {
  let cues;
  if (Array.isArray(req.body?.cues) && req.body.cues.length > 0) {
    cues = req.body.cues;
    setCues(cues);
    console.log(`[Sync] Using ${cues.length} cues from request body`);
  } else {
    const diskCues = loadCuesFromDisk();
    if (diskCues.length > 0) {
      setCues(diskCues);
      cues = diskCues;
      console.log(`[Sync] Re-read ${cues.length} cues from disk`);
    } else {
      cues = getCues();
      console.log(`[Sync] Using ${cues.length} cues from memory`);
    }
  }

  if (cues.length === 0) {
    res.status(400).json({ ok: false, error: "No cues stored. Open the Edit page first." });
    return;
  }

  const companionUrl = getCompanionApiUrl();
  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const validCues = cues.filter(c => c && c.cueNumber != null);
  const gridLayout = getGridLayout();
  const gridSizeData = getGridSize();
  const { buttons, variables } = generateButtonLayout(validCues, baseUrl, gridLayout, gridSizeData);

  console.log(`[Sync] Generated ${buttons.length} buttons, ${Object.keys(variables).length} vars`);

  let stylesUpdated = 0;
  let styleFails = 0;

  for (const btn of buttons) {
    const text = btn.config.style?.text || "";
    const bgcolor = (btn.config.style?.bgcolor ?? 0).toString(16).padStart(6, "0");
    const color = (btn.config.style?.color ?? 0xffffff).toString(16).padStart(6, "0");
    const params = new URLSearchParams({ text, color, bgcolor });
    const styleUrl = `${companionUrl}/api/location/${btn.page}/${btn.row}/${btn.col}/style?${params}`;
    try {
      const resp = await fetch(styleUrl);
      if (resp.ok) {
        stylesUpdated++;
      } else {
        styleFails++;
        const body = await resp.text().catch(() => "");
        console.error(`[Sync] Style ${btn.page}/${btn.row}/${btn.col}: ${resp.status} — ${body}`);
      }
    } catch (err) {
      styleFails++;
      console.error(`[Sync] Style ${btn.page}/${btn.row}/${btn.col}: ${err.message}`);
    }
  }
  console.log(`[Sync] Updated ${stylesUpdated}/${buttons.length} button styles (${styleFails} failed)`);

  for (const [name, varDef] of Object.entries(variables)) {
    const val = varDef.defaultValue ?? "off";
    try {
      await fetch(
        `${companionUrl}/api/custom-variable/${encodeURIComponent(name)}/value?value=${encodeURIComponent(val)}`,
      );
    } catch { /* best-effort */ }
  }

  const configUrl = `${baseUrl}/api/companion/config.companionconfig`;

  if (stylesUpdated === 0 && styleFails > 0) {
    res.status(502).json({
      ok: false,
      error: `Could not reach Companion at ${companionUrl}. Is Companion running?`,
      configUrl,
    });
    return;
  }

  res.json({
    ok: true,
    cueCount: validCues.length,
    stylesUpdated,
    configUrl,
    message: `Updated ${stylesUpdated} button labels. If you've added or removed cues, re-import the config file.`,
  });
});

// --- Config download ---

router.get("/config.companionconfig", (req, res) => {
  const cues = getCues();
  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const gridLayout = getGridLayout();
  const gridSizeData = getGridSize();
  const config = generateCompanionConfig(cues, baseUrl, gridLayout, gridSizeData);
  res.setHeader("Content-Disposition", "attachment; filename=lower-thirds.companionconfig");
  res.json(config);
});

// --- Cue storage ---

router.get("/cues", (_req, res) => {
  res.json({ cues: getCues() });
});

router.post("/cues", (req, res) => {
  const { cues } = req.body;
  if (!Array.isArray(cues)) {
    res.status(400).json({ ok: false, error: "cues must be an array" });
    return;
  }
  setCues(cues);
  res.json({ ok: true, count: cues.length });
});

// --- Grid layout ---

router.get("/grid-layout", (_req, res) => {
  res.json({ layout: getGridLayout(), size: getGridSize() });
});

router.put("/grid-layout", (req, res) => {
  const { layout, size } = req.body;
  if (Array.isArray(layout)) setGridLayout(layout);
  if (size && typeof size === "object") setGridSize(size);
  res.json({ ok: true });
});

// --- Companion API settings ---

router.get("/settings", (_req, res) => {
  res.json({ companionApiUrl: getCompanionApiUrl() });
});

router.put("/settings", (req, res) => {
  const { companionApiUrl } = req.body;
  if (typeof companionApiUrl === "string" && companionApiUrl.trim()) {
    setCompanionApiUrl(companionApiUrl.trim());
  }
  res.json({ ok: true, companionApiUrl: getCompanionApiUrl() });
});

export default router;
