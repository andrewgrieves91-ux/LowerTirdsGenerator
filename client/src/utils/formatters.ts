export function formatTimecode(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "\u2026" : str;
}
