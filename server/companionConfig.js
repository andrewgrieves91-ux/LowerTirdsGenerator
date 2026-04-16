function hexToColor(hex) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r << 16) | (g << 8) | b;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const WHITE = hexToColor("#FFFFFF");
const RED = hexToColor("#CC0000");
const GREEN = hexToColor("#007700");
const GOLD = hexToColor("#AA7700");
const CYAN = hexToColor("#00AACC");
const DARK = hexToColor("#111111");
const BLANK_BG = hexToColor("#1A1A1A");
const NAV_BG = hexToColor("#333333");
const SYNC_COLOR = hexToColor("#0088AA");
const CONNECTION_ID = "generic_http_1";
const MAX_CUE_SLOTS = 21;
const CUE_COLS = 7;

const BASE_STYLE = {
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

function tallyVar(cueNumber) {
  return `lt_tally_${cueNumber}`;
}

function postAction(url) {
  return {
    id: uid(),
    type: "action",
    definitionId: "post",
    connectionId: CONNECTION_ID,
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

function tallyFeedback(variable, value, bgcolor, color = WHITE) {
  return {
    type: "feedback",
    id: uid(),
    definitionId: "variable_value",
    connectionId: "internal",
    upgradeIndex: null,
    isInverted: false,
    options: { variable, op: "eq", value },
    style: { bgcolor, color },
  };
}

function cueButton(cue, baseUrl) {
  const label = `${cue.cueNumber}\n${cue.name.slice(0, 20)}`;
  const selectUrl = `${baseUrl}/api/companion/select/${cue.cueNumber}`;
  const varName = `custom:${tallyVar(cue.cueNumber)}`;

  return {
    type: "button",
    options: { stepProgression: "auto", stepExpression: "", rotaryActions: false },
    style: { ...BASE_STYLE, text: label, bgcolor: DARK },
    feedbacks: [
      tallyFeedback(varName, "live", RED),
      tallyFeedback(varName, "selected", GREEN),
      tallyFeedback(varName, "played", GOLD),
    ],
    steps: {
      0: { action_sets: { down: [postAction(selectUrl)], up: [] }, options: { runWhileHeld: [] } },
    },
    localVariables: [],
  };
}

function blankCueButton(slotIndex, baseUrl) {
  const cueNumber = slotIndex + 1;
  const selectUrl = `${baseUrl}/api/companion/select/${cueNumber}`;
  const varName = `custom:${tallyVar(cueNumber)}`;

  return {
    type: "button",
    options: { stepProgression: "auto", stepExpression: "", rotaryActions: false },
    style: { ...BASE_STYLE, text: "", bgcolor: BLANK_BG },
    feedbacks: [
      tallyFeedback(varName, "live", RED),
      tallyFeedback(varName, "selected", GREEN),
      tallyFeedback(varName, "played", GOLD),
    ],
    steps: {
      0: { action_sets: { down: [postAction(selectUrl)], up: [] }, options: { runWhileHeld: [] } },
    },
    localVariables: [],
  };
}

function navButton(type, text) {
  return {
    type,
    options: {},
    style: { ...BASE_STYLE, text, bgcolor: NAV_BG },
  };
}

function cueSlotPosition(slot) {
  return { row: Math.floor(slot / CUE_COLS), col: (slot % CUE_COLS) + 1 };
}

function utilButton(text, url, bgcolor, feedbacks = []) {
  return {
    type: "button",
    options: { stepProgression: "auto", stepExpression: "", rotaryActions: false },
    style: { ...BASE_STYLE, text, bgcolor },
    feedbacks,
    steps: {
      0: { action_sets: { down: [postAction(url)], up: [] }, options: { runWhileHeld: [] } },
    },
    localVariables: [],
  };
}

export function generateCompanionConfig(cues, baseUrl, gridLayout, gridSizeData) {
  const ANY_LIVE_VAR = "lt_any_live";
  const controls = {};

  const playFeedback = [
    tallyFeedback(`custom:${ANY_LIVE_VAR}`, "true", RED),
  ];

  const utilButtonMap = {
    play:  () => utilButton("▶ PLAY",     `${baseUrl}/api/companion/play`,         CYAN, playFeedback),
    reset: () => utilButton("■ RESET",    `${baseUrl}/api/companion/reset`,        hexToColor("#555555")),
    prev:  () => utilButton("◀ PREV",     `${baseUrl}/api/companion/prev`,         hexToColor("#224488")),
    next:  () => utilButton("NEXT ▶",     `${baseUrl}/api/companion/next`,         hexToColor("#224488")),
    clear: () => utilButton("CLR STATUS", `${baseUrl}/api/companion/clear-status`, hexToColor("#884400")),
    sync:  () => utilButton("⟳ SYNC",     `${baseUrl}/api/companion/sync`,         SYNC_COLOR),
  };

  const cueById = new Map(cues.map(c => [c.id, c]));
  let maxRow = 3;
  let maxCol = 7;

  if (gridLayout && gridLayout.length > 0) {
    const gCols = gridSizeData?.cols ?? gridLayout[0]?.length ?? 8;
    maxCol = gCols - 1;
    maxRow = gridLayout.length - 1;

    for (let r = 0; r < gridLayout.length; r++) {
      for (let c = 0; c < (gridLayout[r]?.length ?? 0); c++) {
        const cell = gridLayout[r][c];
        if (!cell) continue;
        if (!controls[r]) controls[r] = {};

        if (cell.type === "cue" && cell.cueId) {
          const cue = cueById.get(cell.cueId);
          if (cue) controls[r][c] = cueButton(cue, baseUrl);
        } else if (cell.type === "utility" && cell.utilityType) {
          const factory = utilButtonMap[cell.utilityType];
          if (factory) controls[r][c] = factory();
        }
      }
    }
  } else {
    controls[0] = { 0: navButton("pageup", "PAGE\nUP") };
    controls[1] = { 0: navButton("pagenum", "HOME") };
    controls[2] = { 0: navButton("pagedown", "PAGE\nDN") };

    for (let slot = 0; slot < MAX_CUE_SLOTS; slot++) {
      const { row, col } = cueSlotPosition(slot);
      const cue = cues[slot];
      if (!controls[row]) controls[row] = {};
      controls[row][col] = cue ? cueButton(cue, baseUrl) : blankCueButton(slot, baseUrl);
    }

    controls[3] = {
      ...(controls[3] || {}),
      0: utilButtonMap.play(),
      1: utilButtonMap.reset(),
      2: utilButtonMap.prev(),
      3: utilButtonMap.next(),
      4: utilButtonMap.clear(),
      5: utilButtonMap.sync(),
    };
  }

  const instances = {
    [CONNECTION_ID]: {
      moduleInstanceType: "connection",
      instance_type: "generic-http",
      moduleVersionId: "2.7.0",
      sortOrder: 0,
      label: "Lower_Thirds_HTTP",
      isFirstInit: false,
      config: { base_url: baseUrl },
      secrets: {},
      lastUpgradeIndex: 1,
      enabled: true,
    },
  };

  const custom_variables = {
    lt_raw_tally: {
      description: "Raw JSON tally response from the Lower Thirds app",
      defaultValue: '{"tally":[]}',
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

  const cueNumbers = new Set();
  if (gridLayout && gridLayout.length > 0) {
    for (const row of gridLayout) {
      for (const cell of row) {
        if (cell?.type === "cue" && cell.cueNumber != null) cueNumbers.add(cell.cueNumber);
      }
    }
  }
  for (const cue of cues) {
    cueNumbers.add(cue.cueNumber);
  }

  let sortIdx = 2;
  for (const num of [...cueNumbers].sort((a, b) => a - b)) {
    const cue = cues.find(c => c.cueNumber === num);
    custom_variables[tallyVar(num)] = {
      description: cue
        ? `Tally state for cue ${cue.cueNumber} (${cue.name})`
        : `Tally state for cue ${num}`,
      defaultValue: "off",
      persistCurrentValue: false,
      sortOrder: sortIdx++,
    };
  }

  const tallyUrl = `${baseUrl}/api/companion/tally`;

  const extractActions = [
    {
      type: "action",
      id: uid(),
      definitionId: "custom_variable_set_expression",
      connectionId: "internal",
      options: {
        name: ANY_LIVE_VAR,
        expression: 'jsonpath($(custom:lt_raw_tally), "$.anyLive") ?? "false"',
      },
      upgradeIndex: null,
    },
    ...[...cueNumbers].sort((a, b) => a - b).map((cueNumber) => ({
      type: "action",
      id: uid(),
      definitionId: "custom_variable_set_expression",
      connectionId: "internal",
      options: {
        name: tallyVar(cueNumber),
        expression: `jsonpath($(custom:lt_raw_tally), "$.tallyByNumber.${cueNumber}") ?? "off"`,
      },
      upgradeIndex: null,
    })),
  ];

  const triggers = {
    lower_thirds_tally_poll: {
      type: "trigger",
      options: { name: "Lower Thirds Tally Poll", enabled: true, sortOrder: 0 },
      actions: [
        {
          type: "action",
          id: uid(),
          definitionId: "get",
          connectionId: CONNECTION_ID,
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
      events: [{ id: uid(), type: "interval", enabled: true, options: { seconds: 1 } }],
      localVariables: [],
    },
    lower_thirds_tally_extract: {
      type: "trigger",
      options: { name: "Lower Thirds Tally Extract", enabled: true, sortOrder: 1 },
      actions: extractActions,
      condition: [],
      events: [
        { id: uid(), type: "variable_changed", enabled: true, options: { variableId: "custom:lt_raw_tally" } },
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
        controls,
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

export function generateButtonLayout(cues, baseUrl, gridLayout, gridSizeData) {
  const ANY_LIVE_VAR = "lt_any_live";
  const buttons = [];

  const playFeedback = [
    tallyFeedback(`custom:${ANY_LIVE_VAR}`, "true", RED),
  ];

  const utilButtonMap = {
    play:  () => utilButton("▶ PLAY",     `${baseUrl}/api/companion/play`,         CYAN, playFeedback),
    reset: () => utilButton("■ RESET",    `${baseUrl}/api/companion/reset`,        hexToColor("#555555")),
    prev:  () => utilButton("◀ PREV",     `${baseUrl}/api/companion/prev`,         hexToColor("#224488")),
    next:  () => utilButton("NEXT ▶",     `${baseUrl}/api/companion/next`,         hexToColor("#224488")),
    clear: () => utilButton("CLR STATUS", `${baseUrl}/api/companion/clear-status`, hexToColor("#884400")),
    sync:  () => utilButton("⟳ SYNC",     `${baseUrl}/api/companion/sync`,         SYNC_COLOR),
  };

  const cueById = new Map(cues.map(c => [c.id, c]));

  if (gridLayout && gridLayout.length > 0) {
    for (let r = 0; r < gridLayout.length; r++) {
      for (let c = 0; c < (gridLayout[r]?.length ?? 0); c++) {
        const cell = gridLayout[r][c];
        if (!cell) continue;

        if (cell.type === "cue" && cell.cueId) {
          const cue = cueById.get(cell.cueId);
          if (cue) buttons.push({ page: 1, row: r, col: c, config: cueButton(cue, baseUrl) });
        } else if (cell.type === "utility" && cell.utilityType) {
          const factory = utilButtonMap[cell.utilityType];
          if (factory) buttons.push({ page: 1, row: r, col: c, config: factory() });
        }
      }
    }
  } else {
    for (let slot = 0; slot < MAX_CUE_SLOTS; slot++) {
      const { row, col } = cueSlotPosition(slot);
      const cue = cues[slot];
      buttons.push({
        page: 1,
        row,
        col,
        config: cue ? cueButton(cue, baseUrl) : blankCueButton(slot, baseUrl),
      });
    }

    buttons.push({ page: 1, row: 3, col: 0, config: utilButtonMap.play() });
    buttons.push({ page: 1, row: 3, col: 1, config: utilButtonMap.reset() });
    buttons.push({ page: 1, row: 3, col: 2, config: utilButtonMap.prev() });
    buttons.push({ page: 1, row: 3, col: 3, config: utilButtonMap.next() });
    buttons.push({ page: 1, row: 3, col: 4, config: utilButtonMap.clear() });
    buttons.push({ page: 1, row: 3, col: 5, config: utilButtonMap.sync() });
  }

  const variables = {
    lt_raw_tally: {
      description: "Raw JSON tally response from the Lower Thirds app",
      defaultValue: '{"tally":[]}',
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

  const cueNumbers = new Set();
  if (gridLayout && gridLayout.length > 0) {
    for (const row of gridLayout) {
      for (const cell of row) {
        if (cell?.type === "cue" && cell.cueNumber != null) cueNumbers.add(cell.cueNumber);
      }
    }
  }
  for (const cue of cues) cueNumbers.add(cue.cueNumber);

  let sortIdx = 2;
  for (const num of [...cueNumbers].sort((a, b) => a - b)) {
    const cue = cues.find(c => c.cueNumber === num);
    variables[tallyVar(num)] = {
      description: cue
        ? `Tally state for cue ${cue.cueNumber} (${cue.name})`
        : `Tally state for cue ${num}`,
      defaultValue: "off",
      persistCurrentValue: false,
      sortOrder: sortIdx++,
    };
  }

  return { buttons, variables };
}
