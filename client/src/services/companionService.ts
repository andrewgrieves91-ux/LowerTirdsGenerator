import { get, post } from "./api";
import type {
  CommandResponse,
  PollResponse,
  TallyResponse,
  TallyEntry,
  StatusResponse,
} from "../types";

const COMPANION_BASE = "/api/companion";

export function selectCue(cueNumber: number): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/select/${cueNumber}`);
}

export function playCue(): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/play`);
}

export function resetCue(): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/reset`);
}

export function clearStatus(): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/clear-status`);
}

export function selectAndPlay(cueNumber: number): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/select-play/${cueNumber}`);
}

export function nextCue(): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/next`);
}

export function prevCue(): Promise<CommandResponse> {
  return post(`${COMPANION_BASE}/prev`);
}

export function pollCommands(): Promise<PollResponse> {
  return get(`${COMPANION_BASE}/poll`);
}

export function acknowledgeCommand(seq: number): Promise<{ ok: boolean }> {
  return post(`${COMPANION_BASE}/ack`, { seq });
}

export function getTally(): Promise<TallyResponse> {
  return get(`${COMPANION_BASE}/tally`);
}

export function setTally(tally: TallyEntry[]): Promise<{ ok: boolean }> {
  return post(`${COMPANION_BASE}/tally`, { tally });
}

export function getStatus(): Promise<StatusResponse> {
  return get(`${COMPANION_BASE}/status`);
}
