export type TallyState = "live" | "selected" | "played" | "off";

export interface TallyEntry {
  cueNumber: number;
  tally: TallyState;
}

export type CommandType =
  | "select"
  | "play"
  | "reset"
  | "clear_status"
  | "select_and_play"
  | "next_cue"
  | "prev_cue";

export interface PendingCommand {
  type: CommandType;
  cueNumber?: number;
}

export interface PollResponse {
  pendingCommand: PendingCommand | null;
  commandSeq: number;
  commandAt: number;
}

export interface CommandResponse {
  ok: boolean;
  command: PendingCommand;
  seq: number;
}

export interface TallyResponse {
  tally: TallyEntry[];
  tallyByNumber: Record<string, TallyState>;
  anyLive: boolean;
  commandSeq: number;
  pendingCommand: PendingCommand | null;
}

export interface StatusResponse {
  ok: boolean;
  app: string;
  totalCues: number;
  live: number;
  selected: number;
  played: number;
  commandSeq: number;
}
