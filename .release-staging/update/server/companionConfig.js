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
const SYNC_COLOR = hexToColor("#0088AA");
const CONNECTION_ID = "generic_http_1";

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

export function generateCompanionConfig(cues, baseUrl) {
  const ANY_LIVE_VAR = "lt_any_live";
  const pageRows = Math.max(1, Math.ceil(cues.length / 8));
  const controls = {};

  cues.forEach((cue, idx) => {
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    if (!controls[row]) controls[row] = {};
    controls[row][col] = cueButton(cue, baseUrl);
  });

  const playFeedback = [
    tallyFeedback(`custom:${ANY_LIVE_VAR}`, "true", RED),
  ];

  controls[pageRows] = {
    0: utilButton("▶ PLAY", `${baseUrl}/api/companion/play`, CYAN, playFeedback),
    1: utilButton("■ RESET", `${baseUrl}/api/companion/reset`, hexToColor("#555555")),
    2: utilButton("◀ PREV", `${baseUrl}/api/companion/prev`, hexToColor("#224488")),
    3: utilButton("NEXT ▶", `${baseUrl}/api/companion/next`, hexToColor("#224488")),
    4: utilButton("CLR STATUS", `${baseUrl}/api/companion/clear-status`, hexToColor("#884400")),
    5: utilButton("⟳ SYNC", `${baseUrl}/api/companion/sync`, SYNC_COLOR),
  };

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

  cues.forEach((cue, idx) => {
    custom_variables[tallyVar(cue.cueNumber)] = {
      description: `Tally state for cue ${cue.cueNumber} (${cue.name})`,
      defaultValue: "off",
      persistCurrentValue: false,
      sortOrder: idx + 2,
    };
  });

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
    ...cues.map((cue) => ({
      type: "action",
      id: uid(),
      definitionId: "custom_variable_set_expression",
      connectionId: "internal",
      options: {
        name: tallyVar(cue.cueNumber),
        expression: `jsonpath($(custom:lt_raw_tally), "$.tallyByNumber.${cue.cueNumber}") ?? "off"`,
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
        gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: pageRows },
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

export function generateButtonLayout(cues, baseUrl) {
  const ANY_LIVE_VAR = "lt_any_live";
  const pageRows = Math.max(1, Math.ceil(cues.length / 8));
  const buttons = [];

  cues.forEach((cue, idx) => {
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    buttons.push({ page: 1, row, col, config: cueButton(cue, baseUrl) });
  });

  const playFeedback = [
    tallyFeedback(`custom:${ANY_LIVE_VAR}`, "true", RED),
  ];

  const utilRow = pageRows;
  buttons.push({ page: 1, row: utilRow, col: 0, config: utilButton("▶ PLAY", `${baseUrl}/api/companion/play`, CYAN, playFeedback) });
  buttons.push({ page: 1, row: utilRow, col: 1, config: utilButton("■ RESET", `${baseUrl}/api/companion/reset`, hexToColor("#555555")) });
  buttons.push({ page: 1, row: utilRow, col: 2, config: utilButton("◀ PREV", `${baseUrl}/api/companion/prev`, hexToColor("#224488")) });
  buttons.push({ page: 1, row: utilRow, col: 3, config: utilButton("NEXT ▶", `${baseUrl}/api/companion/next`, hexToColor("#224488")) });
  buttons.push({ page: 1, row: utilRow, col: 4, config: utilButton("CLR STATUS", `${baseUrl}/api/companion/clear-status`, hexToColor("#884400")) });
  buttons.push({ page: 1, row: utilRow, col: 5, config: utilButton("⟳ SYNC", `${baseUrl}/api/companion/sync`, SYNC_COLOR) });

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
  cues.forEach((cue, idx) => {
    variables[tallyVar(cue.cueNumber)] = {
      description: `Tally state for cue ${cue.cueNumber} (${cue.name})`,
      defaultValue: "off",
      persistCurrentValue: false,
      sortOrder: idx + 2,
    };
  });

  return { buttons, variables, pageRows };
}
