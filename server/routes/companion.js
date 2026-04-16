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
// Companion 4.x HTTP API (non-deprecated):
//   POST /api/location/<page>/<row>/<col>/style?text=...&bgcolor=HEX&color=HEX
//   POST /api/custom-variable/<name>/value?value=...
//
// This API can update existing button styles and variable values but cannot
// create new buttons. For added/removed cues the user must re-import the config.

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
    res.status(400).json({ ok: false, error: "No cues stored. Open the Edit page first." });
    return;
  }

  const companionUrl = getCompanionApiUrl();
  const port = req.app.get("port") || 3000;
  const baseUrl = `http://localhost:${port}`;
  const validCues = cues.filter(c => c && c.cueNumber != null);
  const { buttons, variables } = generateButtonLayout(validCues, baseUrl);

  const errors = [];
  let stylesUpdated = 0;
  let variablesSet = 0;

  // 1. Update existing button styles via Companion 4.x HTTP API
  for (const btn of buttons) {
    const text = encodeURIComponent(btn.config.style?.text || "");
    const bgcolor = (btn.config.style?.bgcolor ?? 0).toString(16).padStart(6, "0");
    const color = (btn.config.style?.color ?? 0xffffff).toString(16).padStart(6, "0");
    const url = `${companionUrl}/api/location/${btn.page}/${btn.row}/${btn.col}/style?text=${text}&color=${color}&bgcolor=${bgcolor}`;
    try {
      const resp = await fetch(url, { method: "POST" });
      if (resp.ok) {
        stylesUpdated++;
      } else if (resp.status === 403) {
        errors.push("HTTP API is disabled in Companion. Enable it in Settings > Protocols.");
        break;
      } else {
        errors.push(`Style ${btn.row}/${btn.col}: ${resp.status}`);
      }
    } catch (err) {
      errors.push(`Style ${btn.row}/${btn.col}: ${err.message}`);
      break;
    }
  }

  // 2. Reset custom variable values
  for (const [name, varDef] of Object.entries(variables)) {
    const val = encodeURIComponent(varDef.defaultValue ?? "");
    try {
      const resp = await fetch(
        `${companionUrl}/api/custom-variable/${encodeURIComponent(name)}/value?value=${val}`,
        { method: "POST" },
      );
      if (resp.ok) variablesSet++;
    } catch { /* best-effort */ }
  }

  // 3. Always regenerate the config file so it's ready for re-import
  const configUrl = `${baseUrl}/api/companion/config.companionconfig`;

  const has403 = errors.some(e => e.includes("403") || e.includes("disabled"));
  if (has403) {
    res.status(502).json({
      ok: false,
      error: "Companion HTTP Remote Control is disabled. Enable it in Companion Settings > HTTP Remote Control, then retry. "
        + `Alternatively, re-import the config from: ${configUrl}`,
      configUrl,
    });
    return;
  }

  if (errors.length > 0 && stylesUpdated === 0) {
    res.status(502).json({
      ok: false,
      error: `Could not reach Companion at ${companionUrl}. Is Companion running?`,
      configUrl,
      details: errors,
    });
    return;
  }

  res.json({
    ok: true,
    cueCount: validCues.length,
    stylesUpdated,
    variablesSet,
    configUrl,
    message: stylesUpdated > 0
      ? `Updated ${stylesUpdated} button labels. If you added or removed cues, re-import the config from the Export page.`
      : `Config regenerated. Download from: ${configUrl}`,
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
