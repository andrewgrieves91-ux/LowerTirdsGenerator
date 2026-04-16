import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.LT_DATA_DIR || path.resolve(__dirname, "..", "..");
const CUES_FILE = path.join(DATA_DIR, ".lt-companion-cues.json");
const GRID_LAYOUT_FILE = path.join(DATA_DIR, ".lt-companion-grid-layout.json");
const GRID_SIZE_FILE = path.join(DATA_DIR, ".lt-companion-grid-size.json");

export function loadCuesFromDisk() {
  try {
    if (fs.existsSync(CUES_FILE)) {
      return JSON.parse(fs.readFileSync(CUES_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return [];
}

function loadGridLayoutFromDisk() {
  try {
    if (fs.existsSync(GRID_LAYOUT_FILE)) {
      return JSON.parse(fs.readFileSync(GRID_LAYOUT_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

function loadGridSizeFromDisk() {
  try {
    if (fs.existsSync(GRID_SIZE_FILE)) {
      return JSON.parse(fs.readFileSync(GRID_SIZE_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

const state = {
  pendingCommand: null,
  commandAt: 0,
  tally: [],
  commandSeq: 0,
  cues: loadCuesFromDisk(),
  companionApiUrl: "http://localhost:8000",
  gridLayout: loadGridLayoutFromDisk(),
  gridSize: loadGridSizeFromDisk(),
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

export function getGridLayout() {
  return state.gridLayout;
}

export function getGridSize() {
  return state.gridSize;
}

export function setGridLayout(layout) {
  state.gridLayout = layout;
  try { fs.writeFileSync(GRID_LAYOUT_FILE, JSON.stringify(layout)); } catch { /* best-effort */ }
}

export function setGridSize(size) {
  state.gridSize = size;
  try { fs.writeFileSync(GRID_SIZE_FILE, JSON.stringify(size)); } catch { /* best-effort */ }
}

export default state;
