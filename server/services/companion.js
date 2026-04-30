import { generateButtonLayout } from "../companionConfig.js";

/**
 * Build the button + variable payload that gets pushed to a remote Companion
 * instance. Pure: derives only from inputs, no I/O.
 *
 * @param {object} args
 * @param {Array<object>} args.cues - the cue list (may contain partial entries)
 * @param {string} args.baseUrl - URL the Companion instance will call back to
 * @param {Array<Array<object|null>>|null|undefined} args.gridLayout
 * @param {{cols?: number}|null|undefined} args.gridSize
 * @returns {{ buttons: object[], variables: Record<string, object> }}
 */
export function buildSyncPayload({ cues, baseUrl, gridLayout, gridSize }) {
  const validCues = (cues || []).filter((c) => c && c.cueNumber != null);
  return generateButtonLayout(validCues, baseUrl, gridLayout, gridSize);
}

/**
 * Aggregate the public /status payload from a tally array + command sequence.
 * Pure.
 */
export function getStatus(tally, commandSeq) {
  const list = Array.isArray(tally) ? tally : [];
  const live = list.filter((t) => t.tally === "live").length;
  const selected = list.filter((t) => t.tally === "selected").length;
  const played = list.filter((t) => t.tally === "played").length;
  return {
    ok: true,
    app: "Lower Thirds Generator",
    totalCues: list.length,
    live,
    selected,
    played,
    commandSeq,
  };
}

/**
 * Reshape the tally array into a { [cueNumber]: tallyState } map. Pure.
 */
export function getTallyByNumber(tally) {
  const map = {};
  if (!Array.isArray(tally)) return map;
  for (const t of tally) {
    map[String(t.cueNumber)] = t.tally;
  }
  return map;
}

/**
 * Push the given button styles and custom-variable defaults to a remote
 * Bitfocus Companion instance via its HTTP Remote Control API.
 *
 * Encapsulates outbound HTTP with bounded concurrency and per-request timeout
 * — neither of which the original inline implementation in routes had.
 *
 * @param {string} companionUrl  base URL of the Companion HTTP API
 * @param {{ buttons: object[], variables: Record<string, object> }} payload
 * @param {object} [options]
 * @param {number} [options.timeoutMs=5000]   per-request timeout
 * @param {number} [options.concurrency=4]    max parallel requests
 * @param {typeof globalThis.fetch} [options.fetch]   injected for testing
 * @param {(msg: string) => void} [options.logger]    error logger (default: console.error)
 * @returns {Promise<{
 *   stylesUpdated: number,
 *   styleFails: number,
 *   variablesAttempted: number,
 *   errors: Array<{ url: string, kind: string, status?: number, error?: string }>
 * }>}
 */
export async function pushToCompanion(companionUrl, payload, options = {}) {
  const {
    timeoutMs = 5000,
    concurrency = 4,
    fetch = globalThis.fetch,
    logger = (msg) => console.error(msg),
  } = options;

  const buttons = payload?.buttons ?? [];
  const variables = payload?.variables ?? {};

  const styleWork = buttons.map((btn) => {
    const text = btn.config?.style?.text || "";
    const bgcolor = (btn.config?.style?.bgcolor ?? 0)
      .toString(16)
      .padStart(6, "0");
    const color = (btn.config?.style?.color ?? 0xffffff)
      .toString(16)
      .padStart(6, "0");
    const params = new URLSearchParams({ text, color, bgcolor });
    return {
      kind: "style",
      label: `${btn.page}/${btn.row}/${btn.col}`,
      url: `${companionUrl}/api/location/${btn.page}/${btn.row}/${btn.col}/style?${params}`,
    };
  });

  const variableWork = Object.entries(variables).map(([name, def]) => {
    const val = def?.defaultValue ?? "off";
    return {
      kind: "variable",
      label: name,
      url: `${companionUrl}/api/custom-variable/${encodeURIComponent(name)}/value?value=${encodeURIComponent(val)}`,
    };
  });

  const allWork = [...styleWork, ...variableWork];
  const stats = {
    stylesUpdated: 0,
    styleFails: 0,
    variablesAttempted: 0,
    errors: [],
  };

  let cursor = 0;
  async function worker() {
    while (cursor < allWork.length) {
      const item = allWork[cursor++];
      let resp;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          resp = await fetch(item.url, { signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (item.kind === "style") {
          stats.styleFails++;
          stats.errors.push({
            url: item.url,
            kind: item.kind,
            error: err?.message || String(err),
          });
          logger(`[Sync] Style ${item.label}: ${err?.message || err}`);
        }
        // Variable failures are best-effort — silently ignored.
        continue;
      }

      if (item.kind === "style") {
        if (resp && resp.ok) {
          stats.stylesUpdated++;
        } else {
          stats.styleFails++;
          let body = "";
          try { body = await resp.text(); } catch { /* ignore */ }
          stats.errors.push({
            url: item.url,
            kind: item.kind,
            status: resp ? resp.status : undefined,
          });
          logger(`[Sync] Style ${item.label}: ${resp?.status} \u2014 ${body}`);
        }
      } else {
        stats.variablesAttempted++;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, allWork.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return stats;
}
