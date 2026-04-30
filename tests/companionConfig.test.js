import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateCompanionConfig,
  generateButtonLayout,
} from "../server/companionConfig.js";

const BASE_URL = "http://localhost:3000";

const SAMPLE_CUES = [
  { id: "cue-a", cueNumber: 1, name: "First Cue" },
  {
    id: "cue-b",
    cueNumber: 2,
    name: "Second Cue with a Long Long Name That Exceeds Twenty Chars",
  },
  { id: "cue-c", cueNumber: 3, name: "Third" },
];

// uid() inside companionConfig uses Math.random + Date.now. Mocking both makes
// the entire generated config deterministic so we can snapshot it.
function freezeUid() {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(Date, "now").mockReturnValue(1000);
}

describe("companionConfig", () => {
  beforeEach(() => {
    freezeUid();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // generateCompanionConfig — default layout
  // -------------------------------------------------------------------------

  describe("generateCompanionConfig — default layout (no grid)", () => {
    it("returns version 9 full config with required top-level keys", () => {
      const cfg = generateCompanionConfig([], BASE_URL);
      expect(cfg.version).toBe(9);
      expect(cfg.type).toBe("full");
      expect(cfg.companionBuild).toBe("lower-thirds-generator-export");
      expect(cfg.pages).toBeDefined();
      expect(cfg.triggers).toBeDefined();
      expect(cfg.custom_variables).toBeDefined();
      expect(cfg.instances).toBeDefined();
      expect(cfg.surfaces).toEqual({});
      expect(cfg.surfaceGroups).toEqual({});
    });

    it("declares page 1 with grid 0..7 cols by 0..3 rows", () => {
      const cfg = generateCompanionConfig([], BASE_URL);
      expect(cfg.pages[1]).toBeDefined();
      expect(cfg.pages[1].name).toBe("Cues");
      expect(cfg.pages[1].gridSize).toEqual({
        minColumn: 0,
        maxColumn: 7,
        minRow: 0,
        maxRow: 3,
      });
    });

    it("places nav buttons in column 0 of rows 0-2", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const controls = cfg.pages[1].controls;

      expect(controls[0][0].type).toBe("pageup");
      expect(controls[1][0].type).toBe("pagenum");
      expect(controls[2][0].type).toBe("pagedown");
    });

    it("places cues row-major across 7 columns starting at col 1", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const controls = cfg.pages[1].controls;

      // First cue at row 0, col 1
      expect(controls[0][1].type).toBe("button");
      expect(controls[0][1].style.text).toBe("1\nFirst Cue");

      // Second cue at row 0, col 2 — name truncated to 20 chars
      expect(controls[0][2].style.text).toBe(
        "2\nSecond Cue with a Lo",
      );

      // Third cue at row 0, col 3
      expect(controls[0][3].style.text).toBe("3\nThird");
    });

    it("fills remaining cue slots with blank buttons whose URL targets the slot+1 number", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const controls = cfg.pages[1].controls;

      // Slot 3 is the 4th slot → cueNumber 4. Position: row 0, col 4.
      const slot3 = controls[0][4];
      expect(slot3.style.text).toBe("");
      const downAction = slot3.steps[0].action_sets.down[0];
      expect(downAction.options.url).toBe(
        `${BASE_URL}/api/companion/select/4`,
      );
    });

    it("places utility buttons in row 3 cols 0-5 with correct URLs", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const row3 = cfg.pages[1].controls[3];
      const url = (cell) => cell.steps[0].action_sets.down[0].options.url;

      expect(row3[0].style.text).toBe("\u25B6 PLAY");
      expect(url(row3[0])).toBe(`${BASE_URL}/api/companion/play`);

      expect(row3[1].style.text).toBe("\u25A0 RESET");
      expect(url(row3[1])).toBe(`${BASE_URL}/api/companion/reset`);

      expect(row3[2].style.text).toBe("\u25C0 PREV");
      expect(url(row3[2])).toBe(`${BASE_URL}/api/companion/prev`);

      expect(row3[3].style.text).toBe("NEXT \u25B6");
      expect(url(row3[3])).toBe(`${BASE_URL}/api/companion/next`);

      expect(row3[4].style.text).toBe("CLR STATUS");
      expect(url(row3[4])).toBe(
        `${BASE_URL}/api/companion/clear-status`,
      );

      expect(row3[5].style.text).toBe("\u27F3 SYNC");
      expect(url(row3[5])).toBe(`${BASE_URL}/api/companion/sync`);
    });
  });

  // -------------------------------------------------------------------------
  // generateCompanionConfig — custom grid layout
  // -------------------------------------------------------------------------

  describe("generateCompanionConfig — custom gridLayout", () => {
    it("uses gridLayout dimensions for gridSize when no gridSizeData", () => {
      const grid = [
        [null, null, null],
        [null, null, null],
      ];
      const cfg = generateCompanionConfig([], BASE_URL, grid);
      expect(cfg.pages[1].gridSize).toEqual({
        minColumn: 0,
        maxColumn: 2,
        minRow: 0,
        maxRow: 1,
      });
    });

    it("respects gridSizeData.cols when provided (overrides row width)", () => {
      const grid = [[null, null, null]];
      const cfg = generateCompanionConfig(
        [],
        BASE_URL,
        grid,
        { cols: 12 },
      );
      expect(cfg.pages[1].gridSize.maxColumn).toBe(11);
    });

    it("places cue cell when cueId resolves to a known cue", () => {
      const grid = [[{ type: "cue", cueId: "cue-a", cueNumber: 1 }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      const cell = cfg.pages[1].controls[0][0];
      expect(cell.type).toBe("button");
      expect(cell.style.text).toBe("1\nFirst Cue");
    });

    it("ignores cue cell whose cueId is not in cues[]", () => {
      const grid = [[{ type: "cue", cueId: "missing", cueNumber: 99 }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      // The row object is initialized but the cell at [0] stays unset.
      expect(cfg.pages[1].controls[0][0]).toBeUndefined();
    });

    it("places utility cell with valid utilityType", () => {
      const grid = [[{ type: "utility", utilityType: "play" }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      const cell = cfg.pages[1].controls[0][0];
      expect(cell.type).toBe("button");
      expect(cell.style.text).toBe("\u25B6 PLAY");
    });

    it("ignores utility cell with unknown utilityType", () => {
      const grid = [[{ type: "utility", utilityType: "bogus" }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      expect(cfg.pages[1].controls[0][0]).toBeUndefined();
    });

    it("ignores null/undefined cells", () => {
      const grid = [[null, undefined, { type: "utility", utilityType: "play" }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      expect(cfg.pages[1].controls[0][0]).toBeUndefined();
      expect(cfg.pages[1].controls[0][1]).toBeUndefined();
      expect(cfg.pages[1].controls[0][2]).toBeDefined();
    });

    it("does NOT place nav/utility row when gridLayout is provided", () => {
      const grid = [[{ type: "cue", cueId: "cue-a", cueNumber: 1 }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      // Row 3 utilities only get added in default path
      expect(cfg.pages[1].controls[3]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Custom variables
  // -------------------------------------------------------------------------

  describe("custom_variables", () => {
    it("always includes lt_raw_tally and lt_any_live", () => {
      const cfg = generateCompanionConfig([], BASE_URL);
      expect(cfg.custom_variables.lt_raw_tally).toBeDefined();
      expect(cfg.custom_variables.lt_any_live).toBeDefined();
      expect(cfg.custom_variables.lt_raw_tally.defaultValue).toBe(
        '{"tally":[]}',
      );
      expect(cfg.custom_variables.lt_any_live.defaultValue).toBe(
        "false",
      );
    });

    it("creates one tally var per cue with lt_tally_<n> name", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      expect(cfg.custom_variables.lt_tally_1).toBeDefined();
      expect(cfg.custom_variables.lt_tally_2).toBeDefined();
      expect(cfg.custom_variables.lt_tally_3).toBeDefined();
      expect(cfg.custom_variables.lt_tally_1.defaultValue).toBe("off");
    });

    it("uses cue name in tally var description when cue is known", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      expect(cfg.custom_variables.lt_tally_1.description).toContain(
        "First Cue",
      );
    });

    it("falls back to plain cue number in description when cue not in cues[] but in gridLayout", () => {
      const grid = [[{ type: "cue", cueNumber: 99 }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      expect(cfg.custom_variables.lt_tally_99).toBeDefined();
      expect(cfg.custom_variables.lt_tally_99.description).toBe(
        "Tally state for cue 99",
      );
    });

    it("dedupes cue numbers from gridLayout and cues[]", () => {
      // cue-a (cueNumber 1) is in both cues[] and gridLayout
      const grid = [[{ type: "cue", cueId: "cue-a", cueNumber: 1 }]];
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL, grid);
      // Only one lt_tally_1 entry
      const keys = Object.keys(cfg.custom_variables).filter((k) =>
        k.startsWith("lt_tally_"),
      );
      // From cues[] (1, 2, 3) deduped with grid (1) → {1, 2, 3}
      expect(new Set(keys)).toEqual(
        new Set(["lt_tally_1", "lt_tally_2", "lt_tally_3"]),
      );
    });

    it("assigns ascending sortOrder by sorted cue number", () => {
      const cues = [
        { id: "x", cueNumber: 5, name: "Five" },
        { id: "y", cueNumber: 1, name: "One" },
        { id: "z", cueNumber: 3, name: "Three" },
      ];
      const cfg = generateCompanionConfig(cues, BASE_URL);
      expect(cfg.custom_variables.lt_tally_1.sortOrder).toBe(2);
      expect(cfg.custom_variables.lt_tally_3.sortOrder).toBe(3);
      expect(cfg.custom_variables.lt_tally_5.sortOrder).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Triggers
  // -------------------------------------------------------------------------

  describe("triggers", () => {
    it("includes a tally poll trigger that runs every 1 second", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const poll = cfg.triggers.lower_thirds_tally_poll;
      expect(poll).toBeDefined();
      expect(poll.events).toHaveLength(1);
      expect(poll.events[0].type).toBe("interval");
      expect(poll.events[0].options.seconds).toBe(1);
      expect(poll.actions[0].options.url).toBe(
        `${BASE_URL}/api/companion/tally`,
      );
      expect(poll.actions[0].options.jsonResultDataVariable).toBe(
        "lt_raw_tally",
      );
    });

    it("includes a tally extract trigger fired by lt_raw_tally change", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const extract = cfg.triggers.lower_thirds_tally_extract;
      expect(extract).toBeDefined();
      expect(extract.events[0].type).toBe("variable_changed");
      expect(extract.events[0].options.variableId).toBe(
        "custom:lt_raw_tally",
      );
    });

    it("extract trigger has one any-live action plus one per cue", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const extract = cfg.triggers.lower_thirds_tally_extract;
      // 1 any-live action + 3 cue actions
      expect(extract.actions).toHaveLength(4);
      expect(extract.actions[0].options.name).toBe("lt_any_live");
      // Subsequent actions follow sorted cue order
      expect(extract.actions[1].options.name).toBe("lt_tally_1");
      expect(extract.actions[2].options.name).toBe("lt_tally_2");
      expect(extract.actions[3].options.name).toBe("lt_tally_3");
    });
  });

  // -------------------------------------------------------------------------
  // Connection / instance
  // -------------------------------------------------------------------------

  describe("instances", () => {
    it("registers generic_http_1 with the supplied baseUrl", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const inst = cfg.instances.generic_http_1;
      expect(inst).toBeDefined();
      expect(inst.instance_type).toBe("generic-http");
      expect(inst.config.base_url).toBe(BASE_URL);
      expect(inst.enabled).toBe(true);
      expect(inst.label).toBe("Lower_Thirds_HTTP");
    });
  });

  // -------------------------------------------------------------------------
  // Button shape
  // -------------------------------------------------------------------------

  describe("cueButton shape", () => {
    it("has 3 tally feedbacks targeting the right variable", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const btn = cfg.pages[1].controls[0][1];
      expect(btn.feedbacks).toHaveLength(3);
      const varNames = btn.feedbacks.map((f) => f.options.variable);
      expect(varNames).toEqual([
        "custom:lt_tally_1",
        "custom:lt_tally_1",
        "custom:lt_tally_1",
      ]);
      const states = btn.feedbacks.map((f) => f.options.value);
      expect(states).toEqual(["live", "selected", "played"]);
    });

    it("targets POST /api/companion/select/<n> on press-down", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const btn = cfg.pages[1].controls[0][2];
      const action = btn.steps[0].action_sets.down[0];
      expect(action.type).toBe("action");
      expect(action.definitionId).toBe("post");
      expect(action.options.url).toBe(
        `${BASE_URL}/api/companion/select/2`,
      );
      expect(action.options.body).toBe("{}");
      expect(action.options.contenttype).toBe("application/json");
    });

    it("encodes colors as 24-bit RGB integers", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES, BASE_URL);
      const btn = cfg.pages[1].controls[0][1];
      // bgcolor for an active cue button is DARK = 0x111111
      expect(btn.style.bgcolor).toBe(0x111111);
      // text color is WHITE
      expect(btn.style.color).toBe(0xffffff);
      // feedback colors: live=red, selected=green, played=gold
      expect(btn.feedbacks[0].style.bgcolor).toBe(0xcc0000);
      expect(btn.feedbacks[1].style.bgcolor).toBe(0x007700);
      expect(btn.feedbacks[2].style.bgcolor).toBe(0xaa7700);
    });
  });

  // -------------------------------------------------------------------------
  // Snapshot — full deterministic output
  // -------------------------------------------------------------------------

  describe("snapshot (deterministic with mocked uid)", () => {
    it("matches the canonical default-layout output for a small cue set", () => {
      const cfg = generateCompanionConfig(SAMPLE_CUES.slice(0, 2), BASE_URL);
      expect(cfg).toMatchSnapshot();
    });

    it("matches the canonical custom-grid output", () => {
      const grid = [
        [
          { type: "cue", cueId: "cue-a", cueNumber: 1 },
          { type: "utility", utilityType: "play" },
        ],
        [
          { type: "utility", utilityType: "reset" },
          { type: "cue", cueId: "cue-b", cueNumber: 2 },
        ],
      ];
      const cfg = generateCompanionConfig(
        SAMPLE_CUES,
        BASE_URL,
        grid,
        { cols: 2 },
      );
      expect(cfg).toMatchSnapshot();
    });
  });
});

// ===========================================================================
// generateButtonLayout
// ===========================================================================

describe("generateButtonLayout", () => {
  beforeEach(() => {
    freezeUid();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("default layout", () => {
    it("returns { buttons, variables }", () => {
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL);
      expect(layout.buttons).toBeInstanceOf(Array);
      expect(layout.variables).toBeInstanceOf(Object);
    });

    it("emits 21 cue slots + 6 utility buttons (no nav row)", () => {
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL);
      expect(layout.buttons).toHaveLength(27);
      const utilRow3 = layout.buttons.filter((b) => b.row === 3);
      expect(utilRow3).toHaveLength(6);
    });

    it("first cue lands at page 1, row 0, col 1", () => {
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL);
      const first = layout.buttons[0];
      expect(first.page).toBe(1);
      expect(first.row).toBe(0);
      expect(first.col).toBe(1);
      expect(first.config.style.text).toBe("1\nFirst Cue");
    });

    it("variables include lt_raw_tally + lt_any_live + per-cue", () => {
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL);
      expect(layout.variables.lt_raw_tally).toBeDefined();
      expect(layout.variables.lt_any_live).toBeDefined();
      expect(layout.variables.lt_tally_1).toBeDefined();
      expect(layout.variables.lt_tally_2).toBeDefined();
      expect(layout.variables.lt_tally_3).toBeDefined();
    });
  });

  describe("custom gridLayout", () => {
    it("emits one button per non-empty cell, skipping null cells", () => {
      const grid = [
        [
          { type: "cue", cueId: "cue-a", cueNumber: 1 },
          null,
          { type: "utility", utilityType: "play" },
        ],
      ];
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL, grid);
      expect(layout.buttons).toHaveLength(2);
      expect(layout.buttons[0]).toMatchObject({ page: 1, row: 0, col: 0 });
      expect(layout.buttons[1]).toMatchObject({ page: 1, row: 0, col: 2 });
    });

    it("dedupes cue numbers from gridLayout + cues[] in variables", () => {
      const grid = [[{ type: "cue", cueId: "cue-a", cueNumber: 1 }]];
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL, grid);
      const tallyKeys = Object.keys(layout.variables).filter((k) =>
        k.startsWith("lt_tally_"),
      );
      expect(tallyKeys.sort()).toEqual([
        "lt_tally_1",
        "lt_tally_2",
        "lt_tally_3",
      ]);
    });

    it("ignores cells whose cue is missing or utilityType is unknown", () => {
      const grid = [
        [
          { type: "cue", cueId: "missing" },
          { type: "utility", utilityType: "bogus" },
          { type: "utility", utilityType: "sync" },
        ],
      ];
      const layout = generateButtonLayout(SAMPLE_CUES, BASE_URL, grid);
      expect(layout.buttons).toHaveLength(1);
      expect(layout.buttons[0].config.style.text).toBe("\u27F3 SYNC");
    });
  });
});
