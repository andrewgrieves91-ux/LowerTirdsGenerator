import { Router } from "express";
import {
  dispatchCommand,
  getPendingCommand,
  acknowledgeCommand,
  getTally,
  setTally,
  getCommandSeq,
} from "../state/companionState.js";
import {
  cueNumberParam,
  tallyArraySchema,
  ackBodySchema,
} from "../validation.js";

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

export default router;
