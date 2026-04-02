import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

export async function getLocalVersion() {
  const raw = await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf-8");
  const pkg = JSON.parse(raw);
  return { version: pkg.version, updateUrl: pkg.updateUrl || null };
}
