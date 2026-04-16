/*
Settings Page: Application-wide settings
- Feed visibility toggles (Filter 1 / Feed 2 alpha mask)
- Companion / Stream Deck integration setup
- Settings persisted to localStorage
*/

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Link } from "wouter";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Download, AlertTriangle, CheckCircle2, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ─── Config-hash helpers ──────────────────────────────────────────────────────

/** The localStorage key where the last-exported cue fingerprint is stored. */
const LAST_EXPORT_HASH_KEY = "companion-last-export-hash";

/**
 * Compute a stable fingerprint for a cue list.
 * We include: cue count, each cue's id/cueNumber/name, and the full config
 * serialised to JSON.  Sorting by cueNumber makes the hash order-independent.
 */
function computeCueHash(cues: Cue[]): string {
  const sorted = [...cues].sort((a, b) => a.cueNumber - b.cueNumber);
  const fingerprint = sorted.map(c =>
    `${c.id}:${c.cueNumber}:${c.name}:${JSON.stringify(c.config)}`
  ).join("|");
  // Simple djb2-style hash — good enough for change detection
  let hash = 5381;
  for (let i = 0; i < fingerprint.length; i++) {
    hash = ((hash << 5) + hash) ^ fingerprint.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16);
}

// ─── Tally colour map ─────────────────────────────────────────────────────────

const TALLY_COLORS: Record<string, { bg: string; label: string; description: string }> = {
  live:     { bg: "bg-red-600",    label: "RED",   description: "Cue is actively playing on air" },
  selected: { bg: "bg-green-600",  label: "GREEN", description: "Cue is selected / queued, ready to play" },
  played:   { bg: "bg-yellow-500", label: "GOLD",  description: "Cue has been played out (idle)" },
  off:      { bg: "bg-gray-700",   label: "OFF",   description: "Cue is neither selected nor played" },
};

interface CueTally {
  cueNumber: number;
  cueId: string;
  name: string;
  tally: "selected" | "live" | "played" | "off";
}

interface TallyStatus {
  tally: CueTally[];
  commandSeq: number;
}

// ─── Companion Config Generator ──────────────────────────────────────────────

interface Cue {
  id: string;
  cueNumber: number;
  name: string;
  config: {
    name: string;
    title: string;
    [key: string]: unknown;
  };
}

// ─── Stream Deck Grid Editor ─────────────────────────────────────────────────

interface GridCell {
  type: "cue" | "utility" | "empty";
  cueId?: string;
  cueNumber?: number;
  name?: string;
  utilityType?: string;
}

interface DeckPreset {
  id: string;
  label: string;
  cols: number;
  rows: number;
}

const DECK_PRESETS: DeckPreset[] = [
  { id: "mini",  label: "Stream Deck Mini",  cols: 3, rows: 2 },
  { id: "mk2",   label: "Stream Deck MK.2",  cols: 5, rows: 3 },
  { id: "xl",    label: "Stream Deck XL",    cols: 8, rows: 4 },
  { id: "plus",  label: "Stream Deck +",     cols: 4, rows: 2 },
  { id: "neo",   label: "Stream Deck Neo",   cols: 4, rows: 2 },
];

const GRID_SIZE_KEY = "companion-grid-size";
const GRID_LAYOUT_KEY = "companion-grid-layout";

const UTILITY_BUTTONS: { type: string; label: string; color: string }[] = [
  { type: "play",   label: "▶ PLAY",      color: "#00AACC" },
  { type: "reset",  label: "■ RESET",     color: "#555555" },
  { type: "prev",   label: "◀ PREV",      color: "#224488" },
  { type: "next",   label: "NEXT ▶",      color: "#224488" },
  { type: "clear",  label: "CLR STATUS",  color: "#884400" },
];

function loadGridSize(): { cols: number; rows: number; model: string } {
  try {
    const saved = localStorage.getItem(GRID_SIZE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { cols: 8, rows: 4, model: "xl" };
}

function saveGridSize(size: { cols: number; rows: number; model: string }) {
  localStorage.setItem(GRID_SIZE_KEY, JSON.stringify(size));
}

function loadGridLayout(): (GridCell | null)[][] | null {
  try {
    const saved = localStorage.getItem(GRID_LAYOUT_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

function saveGridLayout(layout: (GridCell | null)[][]) {
  localStorage.setItem(GRID_LAYOUT_KEY, JSON.stringify(layout));
}

function makeEmptyGrid(rows: number, cols: number): (GridCell | null)[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function autoLayout(cues: Cue[], rows: number, cols: number): (GridCell | null)[][] {
  const grid = makeEmptyGrid(rows, cols);
  const totalSlots = rows * cols;
  const utilCount = UTILITY_BUTTONS.length;

  const utilRow = rows - 1;
  UTILITY_BUTTONS.forEach((util, i) => {
    if (i < cols && utilRow >= 0) {
      grid[utilRow][i] = { type: "utility", utilityType: util.type, name: util.label };
    }
  });

  const cueSlots = totalSlots - (utilRow >= 0 ? Math.min(utilCount, cols) : 0);
  const maxCueRow = utilRow >= 0 ? utilRow : rows;

  let placed = 0;
  for (let r = 0; r < maxCueRow && placed < cues.length; r++) {
    for (let c = 0; c < cols && placed < cues.length; c++) {
      const cue = cues[placed];
      grid[r][c] = {
        type: "cue",
        cueId: cue.id,
        cueNumber: cue.cueNumber,
        name: cue.name,
      };
      placed++;
    }
  }

  return grid;
}

function resizeGrid(
  oldGrid: (GridCell | null)[][],
  newRows: number,
  newCols: number,
): (GridCell | null)[][] {
  const grid = makeEmptyGrid(newRows, newCols);
  const buttons: GridCell[] = [];
  for (const row of oldGrid) {
    for (const cell of row) {
      if (cell) buttons.push(cell);
    }
  }
  let idx = 0;
  for (let r = 0; r < newRows && idx < buttons.length; r++) {
    for (let c = 0; c < newCols && idx < buttons.length; c++) {
      grid[r][c] = buttons[idx++];
    }
  }
  return grid;
}

function getUtilColor(utilType: string): string {
  return UTILITY_BUTTONS.find(u => u.type === utilType)?.color ?? "#333333";
}

// ─── Grid Editor Components ──────────────────────────────────────────────────

function DeckSizeSelector({
  cols,
  rows,
  model,
  onChange,
}: {
  cols: number;
  rows: number;
  model: string;
  onChange: (cols: number, rows: number, model: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-xs text-gray-400">Deck Model:</label>
      <select
        value={model}
        onChange={(e) => {
          const preset = DECK_PRESETS.find(p => p.id === e.target.value);
          if (preset) {
            onChange(preset.cols, preset.rows, preset.id);
          }
        }}
        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white"
      >
        {DECK_PRESETS.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <span className="text-xs text-gray-500">
        {cols} x {rows} = {cols * rows} buttons
      </span>
    </div>
  );
}

function StreamDeckGrid({
  grid,
  cols,
  onMove,
  onRemove,
}: {
  grid: (GridCell | null)[][];
  cols: number;
  onMove: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onRemove: (row: number, col: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ row: number; col: number } | null>(null);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, row: number, col: number) => {
    setDragFrom({ row, col });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${row},${col}`);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, row: number, col: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver({ row, col });
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, toRow: number, toCol: number) => {
    e.preventDefault();
    setDragOver(null);
    if (dragFrom) {
      onMove(dragFrom.row, dragFrom.col, toRow, toCol);
    }
    setDragFrom(null);
  };

  const handleDragEnd = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const cellSize = cols <= 4 ? "w-20 h-20" : cols <= 5 ? "w-16 h-16" : "w-14 h-14";

  return (
    <div
      className="inline-grid gap-1.5 p-3 bg-gray-950 rounded-lg border border-gray-800"
      style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}
    >
      {grid.map((row, ri) =>
        row.map((cell, ci) => {
          const isDragging = dragFrom?.row === ri && dragFrom?.col === ci;
          const isOver = dragOver?.row === ri && dragOver?.col === ci;

          if (!cell) {
            return (
              <div
                key={`${ri}-${ci}`}
                className={`${cellSize} rounded-lg border-2 border-dashed transition-colors flex items-center justify-center ${
                  isOver
                    ? "border-cyan-400 bg-cyan-950/30"
                    : "border-gray-800 bg-gray-900/40"
                }`}
                onDragOver={(e) => handleDragOver(e, ri, ci)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, ri, ci)}
              />
            );
          }

          let bgColor = "#111111";
          let label = "";

          if (cell.type === "cue") {
            label = `${cell.cueNumber ?? "?"}\n${(cell.name ?? "").slice(0, 12)}`;
          } else if (cell.type === "utility") {
            bgColor = getUtilColor(cell.utilityType ?? "");
            label = cell.name ?? cell.utilityType ?? "";
          }

          return (
            <div
              key={`${ri}-${ci}`}
              draggable
              onDragStart={(e) => handleDragStart(e, ri, ci)}
              onDragOver={(e) => handleDragOver(e, ri, ci)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, ri, ci)}
              onDragEnd={handleDragEnd}
              className={`${cellSize} rounded-lg border-2 relative cursor-grab active:cursor-grabbing transition-all flex flex-col items-center justify-center text-center group select-none ${
                isDragging
                  ? "opacity-30 border-gray-600"
                  : isOver
                  ? "border-cyan-400 ring-2 ring-cyan-400/40"
                  : "border-gray-700 hover:border-gray-500"
              }`}
              style={{ backgroundColor: isDragging ? undefined : bgColor }}
            >
              <span className="text-[9px] leading-tight font-bold text-white whitespace-pre-wrap px-0.5 overflow-hidden">
                {label}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(ri, ci); }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove button"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function GridEditor({ cues }: { cues: Cue[] }) {
  const [gridSize, setGridSize] = useState(loadGridSize);
  const [grid, setGrid] = useState<(GridCell | null)[][]>(() => {
    const saved = loadGridLayout();
    if (saved) return saved;
    return autoLayout(cues, gridSize.rows, gridSize.cols);
  });

  const prevCueIdsRef = useRef<string>("");

  useEffect(() => {
    const cueIds = cues.map(c => c.id).sort().join(",");
    if (cueIds === prevCueIdsRef.current) return;
    prevCueIdsRef.current = cueIds;

    const existingCueIds = new Set<string>();
    for (const row of grid) {
      for (const cell of row) {
        if (cell?.type === "cue" && cell.cueId) existingCueIds.add(cell.cueId);
      }
    }

    const newCues = cues.filter(c => !existingCueIds.has(c.id));
    const removedIds = new Set<string>();
    for (const id of existingCueIds) {
      if (!cues.find(c => c.id === id)) removedIds.add(id);
    }

    if (newCues.length === 0 && removedIds.size === 0) return;

    const updated = grid.map(row =>
      row.map(cell => {
        if (cell?.type === "cue" && cell.cueId && removedIds.has(cell.cueId)) return null;
        return cell;
      })
    );

    for (const cue of newCues) {
      let placed = false;
      for (let r = 0; r < updated.length && !placed; r++) {
        for (let c = 0; c < (updated[r]?.length ?? 0) && !placed; c++) {
          if (!updated[r][c]) {
            updated[r][c] = { type: "cue", cueId: cue.id, cueNumber: cue.cueNumber, name: cue.name };
            placed = true;
          }
        }
      }
    }

    setGrid(updated);
    saveGridLayout(updated);
  }, [cues]);

  useEffect(() => {
    saveGridLayout(grid);
    fetch("/api/companion/grid-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: grid, size: gridSize }),
    }).catch(() => {});
  }, [grid]);

  const handleSizeChange = (cols: number, rows: number, model: string) => {
    const newSize = { cols, rows, model };
    setGridSize(newSize);
    saveGridSize(newSize);
    const resized = resizeGrid(grid, rows, cols);
    setGrid(resized);
  };

  const handleMove = (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    if (fromRow === toRow && fromCol === toCol) return;
    const updated = grid.map(row => [...row]);
    const temp = updated[fromRow][fromCol];
    updated[fromRow][fromCol] = updated[toRow][toCol];
    updated[toRow][toCol] = temp;
    setGrid(updated);
  };

  const handleRemove = (row: number, col: number) => {
    const updated = grid.map(r => [...r]);
    updated[row][col] = null;
    setGrid(updated);
  };

  const handleAutoLayout = () => {
    const newGrid = autoLayout(cues, gridSize.rows, gridSize.cols);
    setGrid(newGrid);
    toast.success("Grid reset to default layout");
  };

  return (
    <div className="border border-cyan-500/30 rounded-md p-4">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider">STREAM DECK LAYOUT</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAutoLayout}
          className="border-gray-700 text-gray-400 hover:bg-gray-800 h-6 text-xs px-2"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Auto-layout
        </Button>
      </div>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Preview and arrange your Stream Deck button layout. Drag buttons to rearrange, click the
        <span className="text-red-400 font-bold mx-1">x</span> to remove.
        Changes are saved to the exported config file.
      </p>
      <DeckSizeSelector
        cols={gridSize.cols}
        rows={gridSize.rows}
        model={gridSize.model}
        onChange={handleSizeChange}
      />
      <div className="mt-4 overflow-x-auto">
        <StreamDeckGrid
          grid={grid}
          cols={gridSize.cols}
          onMove={handleMove}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}

/** Encode a hex colour string (#RRGGBB) to a Companion packed-integer colour. */
function hexToCompanionColor(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r << 16) | (g << 8) | b;
}

/** Generate a simple unique ID string. */
function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Build a complete Companion .companionconfig (version 9 / Companion v4.x) JSON
 * object for the given cues.  Each cue gets its own button on page 1 (rows 0..N/8).
 * Utility buttons (Play, Reset, Next, Prev, CLR STATUS) are placed on the last
 * row of page 1 so everything is on one page.
 *
 * Tally feedback works via:
 *  1. A polling trigger (every 1 s) that GETs /api/companion/tally and stores
 *     each cue's tally state into a custom variable (lt_tally_N).
 *  2. internal:variable_value feedbacks on each button that compare the custom
 *     variable against "live" / "selected" / "played" to colour the button.
 */
function generateCompanionConfig(
  cues: Cue[],
  baseUrl: string,
  gridLayout?: (GridCell | null)[][],
  gridSizeData?: { cols: number; rows: number; model: string },
): object {
  const instanceId = "generic_http_1";

  // ── Shared style defaults ────────────────────────────────────────────────
  const WHITE  = hexToCompanionColor("#FFFFFF");
  const RED    = hexToCompanionColor("#CC0000");
  const GREEN  = hexToCompanionColor("#007700");
  const GOLD   = hexToCompanionColor("#AA7700");
  const CYAN   = hexToCompanionColor("#00AACC");
  const DARK   = hexToCompanionColor("#111111");

  const defaultStyle = {
    text: "",
    textExpression: false,
    size: "auto",
    color: WHITE,
    bgcolor: DARK,
    alignment: "center:center",
    pngalignment: "center:top",
    show_topbar: "default",
    png64: null,
  };

  // ── Custom variable name helpers ─────────────────────────────────────────
  const tallyVarName = (cueNumber: number) => `lt_tally_${cueNumber}`;
  const ANY_LIVE_VAR = "lt_any_live";

  /** Build a POST action for a button press. */
  function postAction(url: string): object {
    return {
      id: uid(),
      type: "action",
      definitionId: "post",
      connectionId: instanceId,
      upgradeIndex: 1,
      options: {
        url,
        body: "{}",
        header: "",
        contenttype: "application/json",
        result_stringify: true,
      },
    };
  }

  /** Build a single NormalButtonModel for a cue. */
  function cueButton(cue: Cue): object {
    const label = `${cue.cueNumber}\n${cue.name.slice(0, 20)}`;
    // Cue buttons use /select/N — operator presses Play separately.
    const selectUrl = `${baseUrl}/api/companion/select/${cue.cueNumber}`;
    // internal:variable field type in Companion v4.2.5 expects the bare
    // "custom:NAME" reference, NOT the display syntax "$(custom:NAME)".
    const varName = `custom:${tallyVarName(cue.cueNumber)}`;

    // Selected state always uses a fixed green background with white text
    // so the operator can instantly identify the queued cue on the Stream Deck.

    /** Build an internal:variable_value feedback entity. */
    function tallyFeedback(tallyState: string, bgColor: number, textColor: number = WHITE): object {
      return {
        type: "feedback",
        id: uid(),
        definitionId: "variable_value",
        connectionId: "internal",
        upgradeIndex: null,
        isInverted: false,
        options: {
          variable: varName,
          op: "eq",
          value: tallyState,
        },
        style: { bgcolor: bgColor, color: textColor },
      };
    }

    return {
      type: "button",
      options: { stepProgression: "auto", stepExpression: "", rotaryActions: false },
      style: { ...defaultStyle, text: label, bgcolor: DARK },
      feedbacks: [
        tallyFeedback("live",     RED),
        tallyFeedback("selected", GREEN),
        tallyFeedback("played",   GOLD),
      ],
      steps: {
        "0": {
          action_sets: {
            down: [postAction(selectUrl)],
            up: [],
          },
          options: { runWhileHeld: [] },
        },
      },
      localVariables: [],
    };
  }

  /** Build a utility button (Play / Reset / Next / Prev / CLR STATUS).
   *  Optional feedbacks array allows adding tally-driven colour changes.
   */
  function utilButton(label: string, url: string, bgColor: number, feedbacks: object[] = []): object {
    return {
      type: "button",
      options: { stepProgression: "auto", stepExpression: "", rotaryActions: false },
      style: { ...defaultStyle, text: label, bgcolor: bgColor },
      feedbacks,
      steps: {
        "0": {
          action_sets: {
            down: [postAction(url)],
            up: [],
          },
          options: { runWhileHeld: [] },
        },
      },
      localVariables: [],
    };
  }

  // ── Page 1: buttons placed according to grid layout ──────────────────────

  const playButtonFeedbacks: object[] = [
    {
      type: "feedback",
      id: uid(),
      definitionId: "variable_value",
      connectionId: "internal",
      upgradeIndex: null,
      isInverted: false,
      options: {
        variable: `custom:${ANY_LIVE_VAR}`,
        op: "eq",
        value: "true",
      },
      style: { bgcolor: RED, color: WHITE },
    },
  ];

  const utilButtonMap: Record<string, () => object> = {
    play:   () => utilButton("▶ PLAY",     `${baseUrl}/api/companion/play`,         CYAN, playButtonFeedbacks),
    reset:  () => utilButton("■ RESET",    `${baseUrl}/api/companion/reset`,        hexToCompanionColor("#555555")),
    prev:   () => utilButton("◀ PREV",     `${baseUrl}/api/companion/prev`,         hexToCompanionColor("#224488")),
    next:   () => utilButton("NEXT ▶",     `${baseUrl}/api/companion/next`,         hexToCompanionColor("#224488")),
    clear:  () => utilButton("CLR STATUS", `${baseUrl}/api/companion/clear-status`, hexToCompanionColor("#884400")),
    sync:   () => utilButton("↻ SYNC",     `${baseUrl}/api/companion/sync`,         hexToCompanionColor("#666600")),
  };

  const cueById = new Map(cues.map(c => [c.id, c]));

  const page1Controls: Record<number, Record<number, object>> = {};
  let maxRow = 0;
  let maxCol = 7;

  if (gridLayout && gridLayout.length > 0) {
    const gCols = gridSizeData?.cols ?? gridLayout[0]?.length ?? 8;
    maxCol = gCols - 1;
    maxRow = gridLayout.length - 1;

    for (let r = 0; r < gridLayout.length; r++) {
      for (let c = 0; c < (gridLayout[r]?.length ?? 0); c++) {
        const cell = gridLayout[r][c];
        if (!cell) continue;

        if (!page1Controls[r]) page1Controls[r] = {};

        if (cell.type === "cue" && cell.cueId) {
          const cue = cueById.get(cell.cueId);
          if (cue) page1Controls[r][c] = cueButton(cue);
        } else if (cell.type === "utility" && cell.utilityType) {
          const factory = utilButtonMap[cell.utilityType];
          if (factory) page1Controls[r][c] = factory();
        }
      }
    }
  } else {
    const cueRowCount = Math.max(1, Math.ceil(cues.length / 8));
    const utilRowIdx = cueRowCount;
    maxRow = utilRowIdx;

    cues.forEach((cue, idx) => {
      const row = Math.floor(idx / 8);
      const col = idx % 8;
      if (!page1Controls[row]) page1Controls[row] = {};
      page1Controls[row][col] = cueButton(cue);
    });

    page1Controls[utilRowIdx] = {
      0: utilButtonMap.play(),
      1: utilButtonMap.reset(),
      2: utilButtonMap.prev(),
      3: utilButtonMap.next(),
      4: utilButtonMap.clear(),
    };
  }

  // ── Instance definition ───────────────────────────────────────────────────
  const instances: Record<string, object> = {
    [instanceId]: {
      moduleInstanceType: "connection",
      instance_type: "generic-http",
      moduleVersionId: "2.7.0",
      sortOrder: 0,
      label: "Lower_Thirds_HTTP",
      isFirstInit: false,
      config: { base_url: "http://localhost:3000" },
      secrets: {},
      lastUpgradeIndex: 1,
      enabled: true,
    },
  };

  // ── Custom variables ──────────────────────────────────────────────────────
  const custom_variables: Record<string, object> = {
    lt_raw_tally: {
      description: "Raw JSON tally response from the Lower Thirds app",
      defaultValue: "{\"tally\":[]}",
      persistCurrentValue: false,
      sortOrder: 0,
    },
    [ANY_LIVE_VAR]: {
      description: "true when any cue is currently live or animating",
      defaultValue: "false",
      persistCurrentValue: false,
      sortOrder: 1,
    },
  };
  cues.forEach((cue, idx) => {
    custom_variables[tallyVarName(cue.cueNumber)] = {
      description: `Tally state for cue ${cue.cueNumber} (${cue.name})`,
      defaultValue: "off",
      persistCurrentValue: false,
      sortOrder: idx + 2,
    };
  });

  // ── Tally polling trigger ─────────────────────────────────────────────────
  const tallyUrl = `${baseUrl}/api/companion/tally`;

  // The extract actions run the jsonpath expressions to populate lt_tally_N and lt_any_live.
  // They are separated from the GET action so they can be reused by the variable-change trigger.
  const extractActions: object[] = [
    {
      type: "action",
      id: uid(),
      definitionId: "custom_variable_set_expression",
      connectionId: "internal",
      options: {
        name: ANY_LIVE_VAR,
        expression: `jsonpath($(custom:lt_raw_tally), "$.anyLive") ?? "false"`,
      },
      upgradeIndex: null,
    },
    ...cues.map((cue) => ({
      type: "action",
      id: uid(),
      definitionId: "custom_variable_set_expression",
      connectionId: "internal",
      options: {
        name: tallyVarName(cue.cueNumber),
        expression: `jsonpath($(custom:lt_raw_tally), "$.tallyByNumber.${cue.cueNumber}") ?? "off"`,
      },
      upgradeIndex: null,
    })),
  ];

  const triggers: Record<string, object> = {
    // Trigger 1: Poll the tally endpoint every second to keep lt_raw_tally fresh.
    "lower_thirds_tally_poll": {
      type: "trigger",
      options: {
        name: "Lower Thirds Tally Poll",
        enabled: true,
        sortOrder: 0,
      },
      actions: [
        {
          type: "action",
          id: uid(),
          definitionId: "get",
          connectionId: instanceId,
          upgradeIndex: 1,
          options: {
            url: tallyUrl,
            header: "",
            jsonResultDataVariable: "lt_raw_tally",
            result_stringify: false,
            statusCodeVariable: "",
          },
        },
      ],
      condition: [],
      events: [
        {
          id: uid(),
          type: "interval",
          enabled: true,
          options: { seconds: 1 },
        },
      ],
      localVariables: [],
    },
    // Trigger 2: Instantly re-extract tally values whenever lt_raw_tally changes.
    // This fires within milliseconds of the GET completing, eliminating the
    // extra polling-cycle delay that would otherwise add up to ~1s of lag.
    "lower_thirds_tally_extract": {
      type: "trigger",
      options: {
        name: "Lower Thirds Tally Extract",
        enabled: true,
        sortOrder: 1,
      },
      actions: extractActions,
      condition: [],
      events: [
        {
          id: uid(),
          type: "variable_changed",
          enabled: true,
          options: { variableId: "custom:lt_raw_tally" },
        },
      ],
      localVariables: [],
    },
  };

  return {
    version: 9,
    type: "full",
    companionBuild: "lower-thirds-generator-export",
    pages: {
      1: {
        id: uid(),
        name: "Cues",
        controls: page1Controls,
        gridSize: { minColumn: 0, maxColumn: maxCol, minRow: 0, maxRow: maxRow },
      },
    },
    triggers,
    triggerCollections: [],
    custom_variables,
    customVariablesCollections: [],
    expressionVariables: {},
    expressionVariablesCollections: [],
    instances,
    connectionCollections: [],
    surfaces: {},
    surfaceGroups: {},
  };
}

// ─── Companion Tab ────────────────────────────────────────────────────────────

function CompanionTab() {
  const [origin, setOrigin] = useState("");
  const [localIPs, setLocalIPs] = useState<string[]>([]);
  const [localPort, setLocalPort] = useState<number>(3000);
  const [tallyStatus, setTallyStatus] = useState<TallyStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [cues, setCues] = useState<Cue[]>(() => {
    try {
      const saved = localStorage.getItem("lower-thirds-cues");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // ── Config-outdated tracking ───────────────────────────────────────────────
  // null  = never exported
  // false = up to date
  // true  = cues changed since last export
  const [configOutdated, setConfigOutdated] = useState<boolean | null>(null);
  const [currentCueCount, setCurrentCueCount] = useState(0);

  /** Recompute whether the config is outdated by comparing current cues to the
   *  hash stored at the time of the last export. */
  const checkConfigOutdated = useCallback(() => {
    const saved = localStorage.getItem("lower-thirds-cues");
    const loadedCues: Cue[] = saved ? JSON.parse(saved) : [];
    setCues(loadedCues);
    setCurrentCueCount(loadedCues.length);
    const lastHash = localStorage.getItem(LAST_EXPORT_HASH_KEY);
    if (!lastHash) {
      setConfigOutdated(loadedCues.length > 0 ? null : null);
      return;
    }
    const currentHash = computeCueHash(loadedCues);
    setConfigOutdated(currentHash !== lastHash);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Fetch local network IPs from the server
    fetch("/api/network-info")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.ips)) setLocalIPs(data.ips);
        if (typeof data.port === "number") setLocalPort(data.port);
      })
      .catch(() => {/* silently ignore — not critical */});

    // Initial check
    checkConfigOutdated();

    // Re-check whenever cues change in localStorage (cross-tab events)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "lower-thirds-cues" || e.key === LAST_EXPORT_HASH_KEY) {
        checkConfigOutdated();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Also poll every 3 s to catch same-tab changes (storage events don't fire
    // for writes made in the same tab, e.g. when Edit page is open here)
    const pollInterval = setInterval(checkConfigOutdated, 3000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(pollInterval);
    };
  }, [checkConfigOutdated]);

  const fetchTally = async (showError = false) => {
    try {
      const res = await fetch("/api/companion/tally");
      if (res.ok) {
        const data = await res.json();
        setTallyStatus(data);
        setLastRefresh(new Date());
      } else if (showError) {
        toast.error("Companion API returned an error");
      }
    } catch {
      if (showError) toast.error("Could not reach Companion API");
    }
  };

  useEffect(() => {
    fetchTally();
    const interval = setInterval(fetchTally, 2000);
    return () => clearInterval(interval);
  }, []);

  const exportCompanionConfig = () => {
    try {
      if (cues.length === 0) {
        toast.error("No cues found. Please create some cues on the Edit page first.");
        return;
      }

      const gridLayout = loadGridLayout();
      const gridSizeData = loadGridSize();
      const config = generateCompanionConfig(
        cues,
        `http://localhost:${localPort}`,
        gridLayout ?? undefined,
        gridSizeData,
      );
      const json = JSON.stringify(config, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lower-thirds.companionconfig";
      a.click();
      URL.revokeObjectURL(url);

      const exportedHash = computeCueHash(cues);
      localStorage.setItem(LAST_EXPORT_HASH_KEY, exportedHash);
      setConfigOutdated(false);

      toast.success(`Exported config for ${cues.length} cue${cues.length !== 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Export failed — see browser console for details.");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`Copied: ${label}`);
    });
  };

  const endpoints = [
    { method: "POST", path: "/api/companion/select/:n",    example: `${origin}/api/companion/select/1`,      description: "Select cue N (1-based). Highlights the cue without playing." },
    { method: "POST", path: "/api/companion/play",         example: `${origin}/api/companion/play`,           description: "Play (or toggle off) the currently selected cue." },
    { method: "POST", path: "/api/companion/reset",        example: `${origin}/api/companion/reset`,          description: "Hard-reset the animation to idle." },
    { method: "POST", path: "/api/companion/select-play/:n", example: `${origin}/api/companion/select-play/1`, description: "Select cue N and immediately play it in one press." },
    { method: "POST", path: "/api/companion/next",         example: `${origin}/api/companion/next`,           description: "Select the next cue (wraps around)." },
    { method: "POST", path: "/api/companion/prev",         example: `${origin}/api/companion/prev`,           description: "Select the previous cue (wraps around)." },
    { method: "POST", path: "/api/companion/clear-status", example: `${origin}/api/companion/clear-status`,   description: "Clear the played-cues status list — equivalent to the Reset Status button in the cue list." },
    { method: "GET",  path: "/api/companion/tally",        example: `${origin}/api/companion/tally`,          description: "Returns JSON tally state for all cues. Poll to colour Stream Deck buttons." },
    { method: "GET",  path: "/api/companion/status",       example: `${origin}/api/companion/status`,         description: "Health check — returns app name and command sequence number." },
  ];

  return (
    <div className="space-y-8">

      {/* Connection URL */}
      <div className="border border-cyan-500/50 rounded-md p-4 bg-cyan-950/20">
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-1">APP CONNECTION URL</h3>
        <p className="text-xs text-gray-400 mb-3 leading-relaxed">
          Enter one of these URLs as the <span className="text-gray-200 font-semibold">Base URL</span> when
          configuring the <span className="text-gray-200">Generic HTTP request</span> connection in
          Bitfocus Companion after importing the config file.
        </p>

        {/* Public / browser URL */}
        <div className="mb-2">
          <p className="text-xs text-gray-500 mb-1">Public URL (use if Companion is on a different network)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-cyan-300 font-mono truncate select-all">
              {origin || "Loading…"}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(origin, "Public URL")}
              className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 flex-shrink-0"
              disabled={!origin}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy
            </Button>
          </div>
        </div>

        {/* Same device */}
        <div className="mb-2">
          <p className="text-xs text-gray-500 mb-1">Same device (use if Companion is running on this computer)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-yellow-300 font-mono truncate select-all">
              {`http://localhost:${localPort}`}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(`http://localhost:${localPort}`, "Localhost URL")}
              className="border-yellow-600 text-yellow-400 hover:bg-yellow-500/10 flex-shrink-0"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy
            </Button>
          </div>
        </div>

        {/* Local network IP(s) */}
        {localIPs.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Local network address (use if Companion is on the same LAN)</p>
            {localIPs.map((ip) => {
              const localUrl = `http://${ip}:${localPort}`;
              return (
                <div key={ip} className="flex items-center gap-2 mb-1">
                  <code className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-green-300 font-mono truncate select-all">
                    {localUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(localUrl, "Local URL")}
                    className="border-green-600 text-green-400 hover:bg-green-500/10 flex-shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export Companion Config */}
      <div className={`border rounded-md p-4 transition-colors ${
        configOutdated === true
          ? "border-yellow-500/70 bg-yellow-950/20"
          : configOutdated === false
          ? "border-green-600/40 bg-green-950/10"
          : "border-cyan-500/30"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xs font-bold text-cyan-400 tracking-wider">EXPORT COMPANION CONFIG</h3>
              {/* Config status badge */}
              {configOutdated === true && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-300 bg-yellow-900/60 border border-yellow-500/50 rounded px-1.5 py-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  Config outdated — re-export
                </span>
              )}
              {configOutdated === false && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-green-300 bg-green-900/40 border border-green-600/40 rounded px-1.5 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Up to date
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Downloads a pre-configured <code className="bg-gray-800 px-1 rounded">.companionconfig</code> file
              for all current cues. Import it into Bitfocus Companion via{" "}
              <span className="text-gray-300">Settings → Import / Export</span>.
              Each cue gets its own button with select-and-play action and live tally feedback (red/green/gold).
              A second page contains Play, Reset, Next and Prev utility buttons.
            </p>
            {configOutdated === true && (
              <p className="text-xs text-yellow-300/80 mt-2 leading-relaxed">
                Cues have changed since the last export. Re-export and re-import the config into Companion to keep your Stream Deck buttons in sync ({currentCueCount} cue{currentCueCount !== 1 ? "s" : ""} currently).
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={exportCompanionConfig}
            className={`border-0 flex-shrink-0 text-xs text-white ${
              configOutdated === true
                ? "bg-yellow-600 hover:bg-yellow-500"
                : "bg-cyan-600 hover:bg-cyan-500"
            }`}
          >
            <Download className="w-3 h-3 mr-1.5" />
            Export .companionconfig
          </Button>
        </div>
      </div>

      {/* Stream Deck Grid Editor */}
      <GridEditor cues={cues} />

      {/* Tally Colour Legend */}
      <div>
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-3">TALLY COLOURS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(TALLY_COLORS).map(([key, val]) => (
            <div key={key} className={`${val.bg} rounded p-3 text-center`}>
              <div className="text-xs font-bold text-white">{val.label}</div>
              <div className="text-xs text-white/80 mt-0.5 leading-tight">{val.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Tally Status */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-cyan-400 tracking-wider">LIVE TALLY STATUS</h3>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-gray-500">Updated {lastRefresh.toLocaleTimeString()}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchTally(true)}
              className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 h-6 text-xs px-2"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {tallyStatus && tallyStatus.tally.length > 0 ? (
          <div className="border border-gray-800 rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-900 text-gray-400">
                  <th className="text-left p-2 border-b border-gray-800">Cue #</th>
                  <th className="text-left p-2 border-b border-gray-800">Name</th>
                  <th className="text-left p-2 border-b border-gray-800">Tally</th>
                  <th className="text-left p-2 border-b border-gray-800 hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {tallyStatus.tally.map((cue) => {
                  const color = TALLY_COLORS[cue.tally];
                  return (
                    <tr key={cue.cueId} className="border-b border-gray-800">
                      <td className="p-2">{cue.cueNumber}</td>
                      <td className="p-2">{cue.name}</td>
                      <td className="p-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${color.bg} mr-1.5`} />
                        {color.label}
                      </td>
                      <td className="p-2 text-gray-400 hidden sm:table-cell">{color.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-gray-800 rounded p-4 text-center text-gray-500 text-xs">
            {tallyStatus
              ? "No cues loaded. Go to the Live page and load some cues first."
              : "Fetching tally state..."}
          </div>
        )}
      </div>

      {/* HTTP API Endpoints */}
      <div>
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-3">HTTP API ENDPOINTS</h3>
        <div className="space-y-2">
          {endpoints.map((ep) => (
            <div key={ep.path} className="border border-gray-800 rounded p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      ep.method === "GET" ? "bg-blue-600 text-white" : "bg-green-700 text-white"
                    }`}>
                      {ep.method}
                    </span>
                    <code className="text-xs text-cyan-300">{ep.path}</code>
                  </div>
                  <p className="text-xs text-gray-400 mb-1.5">{ep.description}</p>
                  <code className="text-xs text-gray-300 bg-gray-900 px-2 py-1 rounded block truncate">
                    {ep.example}
                  </code>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(ep.example, ep.path)}
                  className="border-gray-700 text-gray-400 hover:bg-gray-800 h-7 text-xs px-2 flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Setup Steps */}
      <div>
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-3">COMPANION SETUP STEPS</h3>
        <ol className="space-y-4 text-sm text-gray-300">
          {[
            {
              title: "Install the Generic HTTP module",
              body: "In Companion, open Connections → Add connection → search for \"Generic HTTP\". Add one instance.",
            },
            {
              title: "Create a button to select a cue",
              body: `Add a button action: Generic HTTP → POST → URL: ${origin}/api/companion/select/1\n(Replace 1 with the cue number you want to select.)`,
            },
            {
              title: "Create a Play button",
              body: `Add a button action: Generic HTTP → POST → URL: ${origin}/api/companion/play\nThis toggles the selected cue on/off, matching the Space key on the Live page.`,
            },
            {
              title: "Create a Select + Play button (recommended)",
              body: `For a single-press workflow: Generic HTTP → POST → URL: ${origin}/api/companion/select-play/1\nThis selects cue 1 and immediately plays it.`,
            },
            {
              title: "Set up tally feedback",
              body: `Add a button feedback: Generic HTTP → GET → URL: ${origin}/api/companion/tally\nParse the JSON response. For cue N, check tally[N-1].tally:\n  "live" → red  |  "selected" → green  |  "played" → gold  |  "off" → default`,
            },
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <div>
                <div className="font-bold text-white text-xs mb-0.5">{step.title}</div>
                <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{step.body}</pre>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Keyboard Shortcut Reference */}
      <div>
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-3">KEYBOARD SHORTCUT REFERENCE</h3>
        <div className="border border-gray-800 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900 text-gray-400">
                <th className="text-left p-2 border-b border-gray-800">Key</th>
                <th className="text-left p-2 border-b border-gray-800">Action</th>
                <th className="text-left p-2 border-b border-gray-800 hidden sm:table-cell">Companion Equivalent</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Space",  "Play / toggle selected cue",    "POST /api/companion/play"],
                ["R",      "Reset animation to idle",        "POST /api/companion/reset"],
                ["Esc",    "Clear played-cues status list",  "POST /api/companion/clear-status"],
                ["↑ / ↓",  "Select prev / next cue",         "POST /api/companion/prev|next"],
                ["1–9",    "Select cue by number",           "POST /api/companion/select/:n"],
              ].map(([key, action, api]) => (
                <tr key={key} className="border-b border-gray-800">
                  <td className="p-2"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded text-white">{key}</kbd></td>
                  <td className="p-2 text-gray-300">{action}</td>
                  <td className="p-2 text-cyan-300 font-mono hidden sm:table-cell">{api}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const { showFilter1, setShowFilter1, showFeed2Alpha, setShowFeed2Alpha } = useAppSettings();

  return (
    <div className="space-y-6">
      {/* Feed Visibility Section */}
      <div className="border border-cyan-500/30 rounded-md p-5">
        <h3 className="text-xs font-bold text-cyan-400 tracking-wider mb-1">FEED VISIBILITY</h3>
        <p className="text-xs text-gray-500 mb-5">
          Control which video feeds are shown in the Live and Edit pages. Hidden feeds continue to render in the background and remain available for pop-out windows.
        </p>

        {/* Filter 1 toggle */}
        <div className="flex items-center justify-between py-4 border-b border-cyan-500/10">
          <div>
            <p className="text-sm font-semibold text-white">Filter 1 — Alpha Matte (Live page)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              White text on black background. Used as the alpha matte input on a vision mixing desk.
            </p>
          </div>
          <button
            onClick={() => setShowFilter1(!showFilter1)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
              showFilter1 ? "bg-cyan-500" : "bg-gray-700"
            }`}
            aria-pressed={showFilter1}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showFilter1 ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Feed 2 alpha toggle */}
        <div className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-semibold text-white">Feed 2 — Alpha Mask Preview (Edit page)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Alpha mask preview canvas shown below the colour output in the Edit page.
            </p>
          </div>
          <button
            onClick={() => setShowFeed2Alpha(!showFeed2Alpha)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
              showFeed2Alpha ? "bg-cyan-500" : "bg-gray-700"
            }`}
            aria-pressed={showFeed2Alpha}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showFeed2Alpha ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-600">Settings are saved automatically and persist between sessions.</p>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

type Tab = "general" | "companion";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  // Allow deep-linking to the Companion tab via ?tab=companion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "companion") setActiveTab("companion");
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "general",   label: "GENERAL" },
    { id: "companion", label: "COMPANION" },
  ];

  return (
    <div className="h-screen bg-black text-white font-mono flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <div className="border-b border-cyan-500/30 px-3 flex items-center justify-between flex-shrink-0 gap-2 min-w-0 h-9">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <h1 className="text-xs font-bold tracking-wider whitespace-nowrap hidden md:block">LOWER THIRDS GENERATOR</h1>
          <nav className="flex gap-2">
            <Link href="/live" className="text-xs hover:text-cyan-400 transition-colors whitespace-nowrap" style={{ color: '#ff0000' }}>
              LIVE
            </Link>
            <Link href="/edit" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              EDIT
            </Link>
            <Link href="/export" className="text-xs text-gray-400 hover:text-cyan-400 transition-colors whitespace-nowrap">
              EXPORT
            </Link>
            <Link href="/settings" className="text-xs font-bold flex items-center gap-1 whitespace-nowrap" style={{ color: 'oklch(0.789 0.154 211.53)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0"></span>
              SETTINGS
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <p className="text-xs text-gray-500 whitespace-nowrap hidden 2xl:block">1920×1080</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-800 px-6 flex gap-0 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs font-bold tracking-wider px-4 py-2.5 border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {activeTab === "general"   && <GeneralTab />}
        {activeTab === "companion" && <CompanionTab />}
      </div>
    </div>
  );
}
