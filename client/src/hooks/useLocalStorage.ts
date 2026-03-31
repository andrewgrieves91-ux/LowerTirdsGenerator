import { useState, useCallback } from "react";
import { loadJSON, saveJSON } from "../services/storageService";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() =>
    loadJSON(key, initialValue),
  );

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        saveJSON(key, next);
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue] as const;
}
