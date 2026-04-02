const state = {
  pendingCommand: null,
  commandAt: 0,
  tally: [],
  commandSeq: 0,
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

export default state;
