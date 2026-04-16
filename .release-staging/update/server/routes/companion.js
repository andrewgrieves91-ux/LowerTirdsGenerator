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
// Uses Companion's internal REST API (PUT /api/locations) to fully create,
// update, and delete buttons. This handles added/removed/reordered cues.

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
  const { buttons, variables, pageRows } = generateButtonLayout(validCues, baseUrl);

  console.log(`[Sync] Generated ${buttons.length} buttons, ${Object.keys(variables).length} variables, ${pageRows + 1} rows`);

  const errors = [];
  let buttonsUpdated = 0;

  // 1. Set page grid size FIRST so Companion allocates enough rows
  try {
    const gridResp = await fetch(`${companionUrl}/api/pages/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cues",
        gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: pageRows },
      }),
    });
    console.log(`[Sync] Grid resize: ${gridResp.status}`);
  } catch (err) {
    console.error(`[Sync] Grid resize failed: ${err.message}`);
    errors.push(`Page grid: ${err.message}`);
  }

  // 2. Clear existing buttons on page 1
  for (let row = 0; row <= pageRows + 5; row++) {
    for (let col = 0; col < 8; col++) {
      try {
        await fetch(`${companionUrl}/api/locations/1/${row}/${col}`, { method: "DELETE" });
      } catch { /* ignore — slot may not exist */ }
    }
  }
  console.log(`[Sync] Cleared existing buttons`);

  // 3. Push each button with full config (creates new buttons)
  for (const btn of buttons) {
    try {
      const resp = await fetch(
        `${companionUrl}/api/locations/${btn.page}/${btn.row}/${btn.col}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(btn.config),
        }
      );
      if (resp.ok) {
        buttonsUpdated++;
      } else {
        const respBody = await resp.text().catch(() => "");
        console.error(`[Sync] Button ${btn.row}/${btn.col} FAILED: ${resp.status} — ${respBody}`);
        errors.push(`Button ${btn.row}/${btn.col}: ${resp.status} ${resp.statusText}`);
      }
    } catch (err) {
      console.error(`[Sync] Button ${btn.row}/${btn.col} ERROR: ${err.message}`);
      errors.push(`Button ${btn.row}/${btn.col}: ${err.message}`);
    }
  }
  console.log(`[Sync] Pushed ${buttonsUpdated}/${buttons.length} buttons`);

  // 4. Push custom variables
  for (const [name, varDef] of Object.entries(variables)) {
    try {
      await fetch(`${companionUrl}/api/custom-variables/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(varDef),
      });
    } catch (err) {
      errors.push(`Variable ${name}: ${err.message}`);
    }
  }

  if (errors.length > 0 && buttonsUpdated === 0) {
    res.status(502).json({
      ok: false,
      error: `Could not reach Companion at ${companionUrl}. Check the Companion API URL in Settings.`,
      details: errors,
    });
    return;
  }

  res.json({
    ok: true,
    cueCount: validCues.length,
    buttonsUpdated,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// --- Config download ---

router.get("/config.companionconfig", (req, res) => {
  const cues = getCues();
  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const config = generateCompanionConfig(cues, baseUrl);
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
