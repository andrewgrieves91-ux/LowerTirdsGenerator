import { useEffect, useRef, useCallback } from "react";
import { pollCommands, acknowledgeCommand } from "../services/companionService";
import type { PendingCommand } from "../types";

const DEFAULT_POLL_INTERVAL_MS = 500;

interface UseCompanionPollingOptions {
  intervalMs?: number;
  onCommand: (command: PendingCommand) => void;
  enabled?: boolean;
}

export function useCompanionPolling({
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  onCommand,
  enabled = true,
}: UseCompanionPollingOptions) {
  const lastSeqRef = useRef<number>(0);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const poll = useCallback(async () => {
    try {
      const { pendingCommand, commandSeq } = await pollCommands();
      if (pendingCommand && commandSeq > lastSeqRef.current) {
        lastSeqRef.current = commandSeq;
        onCommandRef.current(pendingCommand);
        await acknowledgeCommand(commandSeq);
      }
    } catch (err) {
      console.error("Companion poll error:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs, enabled]);
}
