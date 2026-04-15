import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CUES_FILE = path.resolve(__dirname, "..", "..", ".lt-companion-cues.json");

export function loadCuesFromDisk() {
  try {
    if (fs.existsSync(CUES_FILE)) {
      return JSON.parse(fs.readFileSync(CUES_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return [];
}

const state = {
  pendingCommand: null,
  commandAt: 0,
  tally: [],
  commandSeq: 0,
  cues: loadCuesFromDisk(),
  companionApiUrl: "http://localhost:8000",
};

export function dispatchCommand(res, command) {
  state.pendingCommand = command;
  state.commandAt = Date.now();
  state.commandSeq++;
  res.json({ ok: true, command, seq: state.commandSeq });
}

export function getPendingCommand() {
  return {
    pendingCommand: state.pendingCommand,
    commandSeq: state.commandSeq,
    commandAt: state.commandAt,
  };
}

export function acknowledgeCommand(seq) {
  if (seq !== undefined && seq === state.commandSeq) {
    state.pendingCommand = null;
  }
}

export function getTally() {
  return state.tally;
}

export function setTally(tally) {
  state.tally = tally;
}

export function getCommandSeq() {
  return state.commandSeq;
}

export function getCues() {
  return state.cues;
}

export function setCues(cues) {
  state.cues = cues;
  try { fs.writeFileSync(CUES_FILE, JSON.stringify(cues)); } catch { /* best-effort */ }
}

export function getCompanionApiUrl() {
  return state.companionApiUrl;
}

export function setCompanionApiUrl(url) {
  state.companionApiUrl = url;
}

export default state;
