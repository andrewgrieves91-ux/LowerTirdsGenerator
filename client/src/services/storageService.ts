const STORAGE_PREFIX = "lower-thirds:";

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to save ${key} to localStorage`, err);
  }
}

export function remove(key: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}
