import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

let updateState = {
  status: "idle",
  currentVersion: null,
  availableVersion: null,
  manifest: null,
  error: null,
  progress: null,
};

function getPackageJsonPath() {
  return path.join(ROOT_DIR, "package.json");
}

async function readLocalVersion() {
  const raw = await fs.readFile(getPackageJsonPath(), "utf-8");
  const pkg = JSON.parse(raw);
  return { version: pkg.version, updateUrl: pkg.updateUrl };
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

async function fetchGoogleDrive(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await res.text();
      const confirmMatch = html.match(
        /href="(\/uc\?export=download[^"]+)"/,
      );
      if (confirmMatch) {
        const confirmUrl = `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, "&")}`;
        res = await fetch(confirmUrl, {
          signal: controller.signal,
          redirect: "follow",
        });
        if (!res.ok) {
          throw new Error(`Confirm download failed: HTTP ${res.status}`);
        }
      }
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate() {
  try {
    const { version, updateUrl } = await readLocalVersion();
    updateState.currentVersion = version;

    if (!updateUrl) {
      updateState.status = "idle";
      updateState.error = "No updateUrl configured in package.json";
      return updateState;
    }

    const res = await fetchGoogleDrive(updateUrl);
    const manifest = await res.json();
    updateState.manifest = manifest;

    if (compareVersions(manifest.version, version) > 0) {
      updateState.status = "available";
      updateState.availableVersion = manifest.version;
    } else {
      updateState.status = "up-to-date";
      updateState.availableVersion = null;
    }

    updateState.error = null;
    return updateState;
  } catch (err) {
    updateState.status = "error";
    updateState.error = err.message;
    return updateState;
  }
}

async function computeSha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function downloadFile(url, destPath, expectedSize) {
  const res = await fetchGoogleDrive(url, 300000);

  const fileStream = createWriteStream(destPath);
  await pipeline(res.body, fileStream);

  const stat = await fs.stat(destPath);
  if (expectedSize && stat.size !== expectedSize) {
    throw new Error(
      `Size mismatch: expected ${expectedSize}, got ${stat.size}`,
    );
  }
}

function unzip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    exec(
      `unzip -o "${zipPath}" -d "${destDir}"`,
      { maxBuffer: 50 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`unzip failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      },
    );
  });
}

async function dirExists(p) {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function applyUpdate() {
  if (updateState.status !== "available" || !updateState.manifest) {
    throw new Error("No update available to apply");
  }

  const manifest = updateState.manifest;
  const tmpDir = path.join(ROOT_DIR, ".update-tmp");
  const zipPath = path.join(tmpDir, "update.zip");

  try {
    updateState.status = "downloading";
    updateState.progress = "Downloading update...";

    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    await downloadFile(manifest.downloadUrl, zipPath, manifest.sizeBytes);

    updateState.progress = "Verifying checksum...";
    const actualHash = await computeSha256(zipPath);
    if (actualHash !== manifest.sha256) {
      throw new Error(
        `SHA256 mismatch: expected ${manifest.sha256}, got ${actualHash}`,
      );
    }

    updateState.status = "installing";
    updateState.progress = "Extracting update...";

    const extractDir = path.join(tmpDir, "extracted");
    await fs.mkdir(extractDir, { recursive: true });
    await unzip(zipPath, extractDir);

    const newPublicDir = path.join(extractDir, "dist", "public");
    const newServerDir = path.join(extractDir, "server");

    if (!(await dirExists(newPublicDir))) {
      throw new Error("Update ZIP missing dist/public directory");
    }
    if (!(await dirExists(newServerDir))) {
      throw new Error("Update ZIP missing server directory");
    }

    updateState.progress = "Replacing files...";

    const currentPublicDir = path.join(ROOT_DIR, "dist", "public");
    const currentServerDir = path.join(ROOT_DIR, "server");
    const backupPublicDir = path.join(ROOT_DIR, "dist", "public.bak");
    const backupServerDir = path.join(ROOT_DIR, "server.bak");

    await fs.rm(backupPublicDir, { recursive: true, force: true });
    await fs.rm(backupServerDir, { recursive: true, force: true });

    if (await dirExists(currentPublicDir)) {
      await fs.rename(currentPublicDir, backupPublicDir);
    }
    if (await dirExists(currentServerDir)) {
      await fs.rename(currentServerDir, backupServerDir);
    }

    try {
      await fs.rename(newPublicDir, currentPublicDir);
      await fs.rename(newServerDir, currentServerDir);
    } catch (swapErr) {
      updateState.progress = "Swap failed, restoring backup...";
      if (await dirExists(backupPublicDir)) {
        await fs.rm(currentPublicDir, { recursive: true, force: true });
        await fs.rename(backupPublicDir, currentPublicDir);
      }
      if (await dirExists(backupServerDir)) {
        await fs.rm(currentServerDir, { recursive: true, force: true });
        await fs.rename(backupServerDir, currentServerDir);
      }
      throw swapErr;
    }

    updateState.progress = "Updating version...";
    const pkgPath = getPackageJsonPath();
    const pkgRaw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    pkg.version = manifest.version;
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    await fs.rm(backupPublicDir, { recursive: true, force: true });
    await fs.rm(backupServerDir, { recursive: true, force: true });
    await fs.rm(tmpDir, { recursive: true, force: true });

    updateState.status = "restart-required";
    updateState.currentVersion = manifest.version;
    updateState.progress = "Update installed. Please restart the application.";
    updateState.error = null;

    return updateState;
  } catch (err) {
    updateState.status = "error";
    updateState.error = err.message;
    updateState.progress = null;

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    throw err;
  }
}

export function getUpdateState() {
  return { ...updateState };
}

export async function checkOnStartup() {
  try {
    const result = await checkForUpdate();
    if (result.status === "available") {
      console.log(
        `Update available: v${result.currentVersion} → v${result.availableVersion}`,
      );
    } else if (result.status === "up-to-date") {
      console.log(`App is up to date (v${result.currentVersion})`);
    }
  } catch {
    // Silently ignore startup check failures
  }
}
