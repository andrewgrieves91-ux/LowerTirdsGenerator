import { describe, it, expect, vi } from "vitest";
import {
  buildSyncPayload,
  pushToCompanion,
  getStatus,
  getTallyByNumber,
} from "../server/services/companion.js";

const BASE_URL = "http://localhost:3000";

const SAMPLE_CUES = [
  { id: "cue-a", cueNumber: 1, name: "First" },
  { id: "cue-b", cueNumber: 2, name: "Second" },
];

// =============================================================================
// buildSyncPayload
// =============================================================================

describe("buildSyncPayload", () => {
  it("returns { buttons, variables } in the same shape as generateButtonLayout", () => {
    const out = buildSyncPayload({
      cues: SAMPLE_CUES,
      baseUrl: BASE_URL,
      gridLayout: null,
      gridSize: null,
    });
    expect(out.buttons).toBeInstanceOf(Array);
    expect(out.variables).toBeInstanceOf(Object);
    expect(out.buttons.length).toBeGreaterThan(0);
  });

  it("filters out partial cues with no cueNumber", () => {
    const out = buildSyncPayload({
      cues: [...SAMPLE_CUES, { id: "broken" }, null, undefined],
      baseUrl: BASE_URL,
    });
    // Only the two valid cue numbers (1, 2) end up in tally vars
    const tallyKeys = Object.keys(out.variables).filter((k) =>
      k.startsWith("lt_tally_"),
    );
    expect(tallyKeys.sort()).toEqual(["lt_tally_1", "lt_tally_2"]);
  });

  it("handles missing cues argument", () => {
    const out = buildSyncPayload({ cues: undefined, baseUrl: BASE_URL });
    expect(out.buttons).toBeInstanceOf(Array);
    expect(out.variables).toBeInstanceOf(Object);
  });
});

// =============================================================================
// getStatus
// =============================================================================

describe("getStatus", () => {
  it("counts states correctly", () => {
    const tally = [
      { cueNumber: 1, tally: "live" },
      { cueNumber: 2, tally: "selected" },
      { cueNumber: 3, tally: "selected" },
      { cueNumber: 4, tally: "played" },
      { cueNumber: 5, tally: "off" },
    ];
    const status = getStatus(tally, 7);
    expect(status).toEqual({
      ok: true,
      app: "Lower Thirds Generator",
      totalCues: 5,
      live: 1,
      selected: 2,
      played: 1,
      commandSeq: 7,
    });
  });

  it("returns zero counts for empty tally", () => {
    const status = getStatus([], 0);
    expect(status.totalCues).toBe(0);
    expect(status.live).toBe(0);
    expect(status.selected).toBe(0);
    expect(status.played).toBe(0);
  });

  it("treats non-array input as empty", () => {
    expect(getStatus(null, 0).totalCues).toBe(0);
    expect(getStatus(undefined, 0).totalCues).toBe(0);
  });
});

// =============================================================================
// getTallyByNumber
// =============================================================================

describe("getTallyByNumber", () => {
  it("maps cueNumber -> tally state", () => {
    const map = getTallyByNumber([
      { cueNumber: 1, tally: "live" },
      { cueNumber: 2, tally: "selected" },
    ]);
    expect(map).toEqual({ "1": "live", "2": "selected" });
  });

  it("returns empty object for non-array input", () => {
    expect(getTallyByNumber(null)).toEqual({});
    expect(getTallyByNumber(undefined)).toEqual({});
  });
});

// =============================================================================
// pushToCompanion
// =============================================================================

function fakePayload({ buttonCount = 2, variableCount = 1 } = {}) {
  const buttons = Array.from({ length: buttonCount }, (_, i) => ({
    page: 1,
    row: Math.floor(i / 7),
    col: (i % 7) + 1,
    config: { style: { text: `B${i}`, bgcolor: 0x111111, color: 0xffffff } },
  }));
  const variables = {};
  for (let i = 0; i < variableCount; i++) {
    variables[`var_${i}`] = { defaultValue: `v${i}` };
  }
  return { buttons, variables };
}

describe("pushToCompanion", () => {
  it("happy path: counts every successful style update and notes variables attempted", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    const stats = await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 5, variableCount: 3 }),
      { fetch: fetchMock, logger: () => {} },
    );

    expect(stats.stylesUpdated).toBe(5);
    expect(stats.styleFails).toBe(0);
    expect(stats.variablesAttempted).toBe(3);
    expect(stats.errors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(8); // 5 styles + 3 vars
  });

  it("captures HTTP error responses on style updates as styleFails", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n === 2) {
        return { ok: false, status: 500, text: async () => "boom" };
      }
      return { ok: true };
    });

    const stats = await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 3, variableCount: 0 }),
      { fetch: fetchMock, logger: () => {}, concurrency: 1 },
    );

    expect(stats.stylesUpdated).toBe(2);
    expect(stats.styleFails).toBe(1);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].status).toBe(500);
  });

  it("captures network errors and continues with remaining work", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error("ECONNREFUSED");
      return { ok: true };
    });

    const stats = await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 3, variableCount: 0 }),
      { fetch: fetchMock, logger: () => {}, concurrency: 1 },
    );

    expect(stats.stylesUpdated).toBe(2);
    expect(stats.styleFails).toBe(1);
    expect(stats.errors[0].error).toMatch(/ECONNREFUSED/);
  });

  it("aborts requests that exceed timeoutMs", async () => {
    const fetchMock = vi.fn((_url, opts) => {
      // Simulate a hang by waiting on the abort signal
      return new Promise((_, reject) => {
        opts.signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    });

    const stats = await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 1, variableCount: 0 }),
      { fetch: fetchMock, logger: () => {}, timeoutMs: 20 },
    );

    expect(stats.styleFails).toBe(1);
    expect(stats.errors[0].error).toMatch(/abort/i);
  });

  it("respects bounded concurrency", async () => {
    let inFlight = 0;
    let peakConcurrency = 0;
    const fetchMock = vi.fn(async () => {
      inFlight++;
      peakConcurrency = Math.max(peakConcurrency, inFlight);
      // Yield so other workers can pick up
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true };
    });

    await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 20, variableCount: 0 }),
      { fetch: fetchMock, logger: () => {}, concurrency: 3 },
    );

    expect(peakConcurrency).toBeLessThanOrEqual(3);
    expect(peakConcurrency).toBeGreaterThan(1);
  });

  it("variable failures do not raise errors or affect styleFails", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes("/api/custom-variable/")) {
        throw new Error("variable failed");
      }
      return { ok: true };
    });

    const stats = await pushToCompanion(
      "http://companion.local",
      fakePayload({ buttonCount: 2, variableCount: 3 }),
      { fetch: fetchMock, logger: () => {}, concurrency: 2 },
    );

    expect(stats.stylesUpdated).toBe(2);
    expect(stats.styleFails).toBe(0);
    // variablesAttempted only counts successful HTTP calls; failures are silent
    expect(stats.errors).toEqual([]);
  });

  it("handles empty payload without errors", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    const stats = await pushToCompanion(
      "http://companion.local",
      { buttons: [], variables: {} },
      { fetch: fetchMock, logger: () => {} },
    );
    expect(stats.stylesUpdated).toBe(0);
    expect(stats.styleFails).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
