const { app, dialog, BrowserWindow, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const os = require("os");
const { compareVersions } = require("../server/lib/version.cjs");

const GITHUB_API_URL =
  "https://api.github.com/repos/andrewgrieves91-ux/LowerTirdsGenerator/releases/latest";

const CURRENT_VERSION = app.getVersion();

let _cachedEtag = null;
let _cachedRelease = null;

// ─── Logger ───────────────────────────────────────────────────────────────
// All update activity goes to userData/update.log so we can post-mortem
// when the app fails to relaunch and the user has no console output.

function logPath() {
  try {
    const dir = app.getPath("userData");
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    return path.join(dir, "update.log");
  } catch {
    return path.join(os.tmpdir(), "ltg-update.log");
  }
}

function log(line) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] ${line}\n`;
  const p = logPath();
  try {
    fs.appendFileSync(p, msg);
  } catch (err) {
    // Surface the failure so we don't go silent.
    console.error(`[Updater] failed to write log to ${p}:`, err && err.message);
  }
  console.log(`[Updater] ${line}`);
}

// Friendly extraction of an error message — Error.message can be undefined
// (custom errors, Electron NetworkErrors, plain string throws, etc.).
function errMsg(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  if (err.code) return `Error code: ${err.code}`;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ─── Progress window ─────────────────────────────────────────────────────
// A small, frame-less BrowserWindow that we drive from the main process via
// webContents.executeJavaScript. The HTML is loaded as a data URL so we
// don't depend on any disk file that the in-place install might be
// shuffling around.

let progressWin = null;

const PROGRESS_HTML = `
<!doctype html>
<html><head><meta charset="utf-8"><title>Updating Lower Thirds Generator</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0a0a0a; color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-app-region: drag; user-select: none; }
  .wrap { display: flex; flex-direction: column; gap: 14px; padding: 28px; height: 100%; box-sizing: border-box; justify-content: center; }
  h1 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #22d3ee; }
  .ver { font-size: 11px; color: #9ca3af; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .bar { width: 100%; height: 8px; background: #1f2937; border-radius: 4px; overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, #06b6d4, #22d3ee); width: 0%; transition: width .15s ease; border-radius: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; color: #d1d5db; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .err { color: #fca5a5; font-size: 12px; white-space: pre-wrap; line-height: 1.4; max-height: 80px; overflow: auto; display: none; }
  .err.show { display: block; }
  button { -webkit-app-region: no-drag; align-self: flex-end; padding: 6px 14px; border-radius: 4px; border: 1px solid #374151;
    background: #1f2937; color: #e5e5e5; font-size: 12px; cursor: pointer; display: none; }
  button.show { display: inline-block; }
  button:hover { background: #374151; }
</style></head><body>
<div class="wrap">
  <div>
    <h1 id="ph">Preparing update…</h1>
    <div class="ver" id="pv"></div>
  </div>
  <div class="bar"><div class="fill" id="pf"></div></div>
  <div class="row"><span id="pl">—</span><span id="pr">0%</span></div>
  <div class="err" id="pe"></div>
  <button id="pb" onclick="window.close()">Close</button>
</div>
</body></html>
`;

function openProgressWindow(targetVersion) {
  if (progressWin && !progressWin.isDestroyed()) return progressWin;
  progressWin = new BrowserWindow({
    width: 460,
    height: 200,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Updating Lower Thirds Generator",
    backgroundColor: "#0a0a0a",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  progressWin.removeMenu();
  progressWin.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(PROGRESS_HTML),
  );
  progressWin.webContents.once("did-finish-load", () => {
    sendProgress({ headline: `Updating to v${targetVersion}`, version: `v${CURRENT_VERSION} → v${targetVersion}`, percent: 0, label: "Starting" });
  });
  progressWin.on("closed", () => { progressWin = null; });
  return progressWin;
}

function sendProgress(state) {
  if (!progressWin || progressWin.isDestroyed()) return;
  const js = `(function(){
    try {
      ${state.headline !== undefined ? `document.getElementById('ph').textContent = ${JSON.stringify(state.headline)};` : ""}
      ${state.version  !== undefined ? `document.getElementById('pv').textContent = ${JSON.stringify(state.version)};` : ""}
      ${state.percent  !== undefined ? `document.getElementById('pf').style.width = ${JSON.stringify(state.percent + "%")};
                                        document.getElementById('pr').textContent = ${JSON.stringify(Math.round(state.percent) + "%")};` : ""}
      ${state.label    !== undefined ? `document.getElementById('pl').textContent = ${JSON.stringify(state.label)};` : ""}
      ${state.error    !== undefined ? `var e=document.getElementById('pe'); e.textContent=${JSON.stringify(state.error)}; e.classList.add('show');
                                        document.getElementById('pb').classList.add('show');
                                        document.getElementById('pf').style.background='#7f1d1d';` : ""}
    } catch(_){}
  })();`;
  progressWin.webContents.executeJavaScript(js).catch(() => {});
  if (state.percent !== undefined) {
    try { progressWin.setProgressBar(state.percent / 100); } catch {}
  }
}

function closeProgressWindow() {
  if (progressWin && !progressWin.isDestroyed()) progressWin.close();
  progressWin = null;
}

// ─── GitHub release lookup ────────────────────────────────────────────────

function parseRelease(release) {
  const version = (release.tag_name || "").replace(/^v/, "");
  const notes = release.body || "";
  const asset = (release.assets || []).find((a) => a.name.endsWith(".zip"));
  const downloadUrl = asset ? asset.browser_download_url : release.html_url;
  return { version, notes, downloadUrl };
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "LowerThirdsGenerator",
      Accept: "application/vnd.github.v3+json",
    };
    if (_cachedEtag) headers["If-None-Match"] = _cachedEtag;

    const request = net.request({ url: GITHUB_API_URL, headers });
    let data = "";

    request.on("response", (response) => {
      if (response.statusCode === 304 && _cachedRelease) {
        resolve(parseRelease(_cachedRelease));
        return;
      }
      if (response.statusCode === 403) {
        reject(new Error("Rate limited by GitHub \u2014 try again in a few minutes"));
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned HTTP ${response.statusCode}`));
        return;
      }
      response.on("data", (chunk) => { data += chunk.toString(); });
      response.on("end", () => {
        try {
          const release = JSON.parse(data);
          const etag = response.headers.etag;
          const etagVal = Array.isArray(etag) ? etag[0] : etag;
          if (etagVal) _cachedEtag = etagVal;
          _cachedRelease = release;
          resolve(parseRelease(release));
        } catch {
          reject(new Error("Failed to parse GitHub release info"));
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

// ─── Download with real progress ──────────────────────────────────────────

function downloadFile(url, onProgress) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `ltg-update-${Date.now()}.zip`);
    const fileStream = fs.createWriteStream(tmpPath);

    function fail(err) {
      try { fileStream.destroy(); } catch {}
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(err instanceof Error ? err : new Error(errMsg(err)));
    }

    // Let Electron follow redirects automatically (default behaviour). GitHub
    // release-asset URLs always redirect to objects.githubusercontent.com,
    // and the previous "manual" mode was silently aborting those requests.
    const request = net.request({
      url,
      headers: { "User-Agent": "LowerThirdsGenerator" },
    });

    // Defensive: if Electron asks us about a redirect, allow it explicitly.
    request.on("redirect", (statusCode, method, redirectUrl) => {
      log(`Download redirect ${statusCode} -> ${redirectUrl}`);
      try { request.followRedirect(); } catch (err) { fail(err); }
    });

    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        fail(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      const lenHdr = response.headers["content-length"];
      const lenVal = Array.isArray(lenHdr) ? lenHdr[0] : lenHdr;
      const total = parseInt(lenVal, 10) || 0;
      let received = 0;

      response.on("data", (chunk) => {
        try { fileStream.write(chunk); } catch (err) { fail(err); return; }
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      response.on("end", () => {
        fileStream.end(() => resolve(tmpPath));
      });
      response.on("error", (err) => fail(err));
    });

    request.on("error", (err) => fail(err));
    request.end();
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    execFile("unzip", ["-o", zipPath, "-d", destDir], (err, _stdout, stderr) => {
      if (err) reject(new Error(`unzip failed: ${stderr || err.message}`));
      else resolve();
    });
  });
}

function rmIfExists(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─── Atomic replace with rollback ─────────────────────────────────────────
// Strategy:
//   1. Move current dist/public -> dist/public.bak,  server -> server.bak
//   2. Copy new dist/public + server into place
//   3. On any failure, restore from .bak
//   4. On success, delete .bak

async function applyUpdate(downloadUrl, newVersion) {
  const appPath = app.getAppPath();
  const tmpDir = path.join(os.tmpdir(), `ltg-update-extract-${Date.now()}`);

  const targetPublic = path.join(appPath, "dist", "public");
  const targetServer = path.join(appPath, "server");
  const backupPublic = path.join(appPath, "dist", "public.bak");
  const backupServer = path.join(appPath, "server.bak");

    log(`applyUpdate start: appPath=${appPath} tmpDir=${tmpDir} url=${downloadUrl}`);

  try {
    // ── Download ──
    sendProgress({ label: "Downloading", percent: 0 });
    let lastPct = -1;
    const zipPath = await downloadFile(downloadUrl, (received, total) => {
      // Map download to 0–80% of the overall progress.
      let pct;
      if (total > 0) {
        pct = Math.min(80, (received / total) * 80);
      } else {
        // Unknown size: rough estimate based on received bytes (cap at 80%).
        pct = Math.min(70, (received / (5 * 1024 * 1024)) * 70);
      }
      const rounded = Math.floor(pct);
      if (rounded !== lastPct) {
        lastPct = rounded;
        const mbR = (received / (1024 * 1024)).toFixed(1);
        const mbT = total > 0 ? (total / (1024 * 1024)).toFixed(1) : "?";
        sendProgress({ label: `Downloading ${mbR} / ${mbT} MB`, percent: pct });
      }
    });
    log(`Downloaded zip to ${zipPath}`);

    // ── Extract ──
    sendProgress({ label: "Extracting", percent: 82 });
    await extractZip(zipPath, tmpDir);
    log(`Extracted to ${tmpDir}`);

    const newPublic = path.join(tmpDir, "dist", "public");
    const newServer = path.join(tmpDir, "server");
    if (!fs.existsSync(newPublic) || !fs.existsSync(newServer)) {
      throw new Error("Update ZIP is missing dist/public or server directories");
    }

    // ── Atomic-ish replace ──
    sendProgress({ label: "Installing files", percent: 88 });
    // Wipe any leftover backups from a previous interrupted update.
    rmIfExists(backupPublic);
    rmIfExists(backupServer);

    // Backup current files (rename = fast, atomic on same filesystem).
    if (fs.existsSync(targetPublic)) fs.renameSync(targetPublic, backupPublic);
    if (fs.existsSync(targetServer)) fs.renameSync(targetServer, backupServer);
    log(`Backed up current dist/public + server to .bak`);

    let installError = null;
    try {
      fs.cpSync(newPublic, targetPublic, { recursive: true });
      fs.cpSync(newServer, targetServer, { recursive: true });
      log(`Copied new dist/public + server into place`);
    } catch (err) {
      installError = err;
    }

    if (installError) {
      // Roll back.
      rmIfExists(targetPublic);
      rmIfExists(targetServer);
      if (fs.existsSync(backupPublic)) fs.renameSync(backupPublic, targetPublic);
      if (fs.existsSync(backupServer)) fs.renameSync(backupServer, targetServer);
      throw installError;
    }

    // Update package.json version (in place, only the version field).
    sendProgress({ label: "Updating manifest", percent: 94 });
    const pkgPath = path.join(appPath, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      pkg.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      log(`Updated package.json version to ${newVersion}`);
    } catch (err) {
      log(`WARN: failed to update package.json: ${err.message}`);
    }

    // Cleanup.
    sendProgress({ label: "Cleaning up", percent: 97 });
    try { fs.unlinkSync(zipPath); } catch {}
    rmIfExists(tmpDir);
    rmIfExists(backupPublic);
    rmIfExists(backupServer);
    log(`Cleanup done`);

    sendProgress({ label: "Restarting", percent: 100 });
    return true;
  } catch (err) {
    log(`applyUpdate FAILED: ${errMsg(err)}\n${err && err.stack || ""}`);
    rmIfExists(tmpDir);
    throw err;
  }
}

// ─── Restart logic ────────────────────────────────────────────────────────
// On macOS, calling app.exit() too quickly after relaunch() can race with
// the launch; we give it 600ms to schedule the new process before quitting.

function restartApp() {
  log("Scheduling relaunch + exit");
  try { app.relaunch(); } catch (err) { log(`relaunch failed: ${err.message}`); }
  setTimeout(() => {
    log("Exiting now");
    try { app.exit(0); } catch { app.quit(); }
  }, 600);
}

// ─── Top-level orchestration ──────────────────────────────────────────────

async function checkForUpdates(silent = true) {
  try {
    log(`Checking for updates... current=${CURRENT_VERSION} silent=${silent}`);
    const latest = await fetchLatestRelease();
    log(`Latest=${latest.version}`);

    if (compareVersions(latest.version, CURRENT_VERSION) > 0) {
      const result = await dialog.showMessageBox(
        BrowserWindow.getFocusedWindow(),
        {
          type: "info",
          title: "Update Available",
          message: `LTG v${latest.version} is available!`,
          detail: `You have v${CURRENT_VERSION}.\n\nRelease notes:\n${latest.notes}`,
          buttons: ["Download & Install", "Later"],
          defaultId: 0,
          cancelId: 1,
        },
      );

      if (result.response !== 0) return;

      openProgressWindow(latest.version);

      try {
        await applyUpdate(latest.downloadUrl, latest.version);
        // Brief pause so user sees "Restarting" before the window closes.
        setTimeout(() => {
          closeProgressWindow();
          restartApp();
        }, 700);
      } catch (err) {
        const msg = errMsg(err);
        const detail = `${msg}\n\nLog: ${logPath()}`;
        sendProgress({ label: "Update failed", error: detail });
        log(`Install failed: ${msg}`);
        if (err && err.stack) log(`Stack: ${err.stack}`);
        // Leave the window open so the user can read the error.
      }
    } else if (!silent) {
      dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "info",
        title: "No Updates",
        message: "You're running the latest version!",
        detail: `Current version: v${CURRENT_VERSION}\nLog: ${logPath()}`,
      });
    } else {
      log("App is up to date");
    }
  } catch (error) {
    const msg = errMsg(error);
    log(`Error checking for updates: ${msg}`);
    if (!silent) {
      const isRateLimit = msg.includes("Rate limited");
      dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "error",
        title: "Update Check Failed",
        message: "Could not check for updates.",
        detail: isRateLimit ? msg : `${msg}\n\nLog: ${logPath()}`,
      });
    }
  }
}

module.exports = { checkForUpdates };
