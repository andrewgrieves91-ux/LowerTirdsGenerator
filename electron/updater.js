const { app, dialog, BrowserWindow, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const os = require("os");

const GITHUB_API_URL =
  "https://api.github.com/repos/andrewgrieves91-ux/LowerTirdsGenerator/releases/latest";

const CURRENT_VERSION = app.getVersion();

let _cachedEtag = null;
let _cachedRelease = null;

function compareVersions(a, b) {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
    if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
  }
  return 0;
}

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
    if (_cachedEtag) {
      headers["If-None-Match"] = _cachedEtag;
    }

    const request = net.request({ url: GITHUB_API_URL, headers });

    let data = "";

    request.on("response", (response) => {
      if (response.statusCode === 304 && _cachedRelease) {
        resolve(parseRelease(_cachedRelease));
        return;
      }

      if (response.statusCode === 403) {
        reject(
          new Error(
            "Rate limited by GitHub \u2014 try again in a few minutes",
          ),
        );
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned HTTP ${response.statusCode}`));
        return;
      }

      response.on("data", (chunk) => {
        data += chunk.toString();
      });

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

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const tmpPath = path.join(os.tmpdir(), `ltg-update-${Date.now()}.zip`);
    const fileStream = fs.createWriteStream(tmpPath);

    function doRequest(reqUrl) {
      const request = net.request({
        url: reqUrl,
        headers: { "User-Agent": "LowerThirdsGenerator" },
      });

      request.on("response", (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = response.headers.location;
          const redirectUrl = Array.isArray(location) ? location[0] : location;
          if (redirectUrl) {
            doRequest(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          fs.unlinkSync(tmpPath);
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        response.on("data", (chunk) => {
          fileStream.write(chunk);
        });

        response.on("end", () => {
          fileStream.end(() => resolve(tmpPath));
        });
      });

      request.on("error", (err) => {
        fileStream.destroy();
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });

      request.end();
    }

    doRequest(url);
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    execFile("unzip", ["-o", zipPath, "-d", destDir], (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`unzip failed: ${stderr || err.message}`));
      } else {
        resolve();
      }
    });
  });
}

function rmSync(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

async function applyUpdate(downloadUrl, newVersion) {
  const appPath = app.getAppPath();
  const tmpDir = path.join(os.tmpdir(), `ltg-update-extract-${Date.now()}`);

  try {
    console.log("[Updater] Downloading update...");
    const zipPath = await downloadFile(downloadUrl);

    console.log("[Updater] Extracting...");
    await extractZip(zipPath, tmpDir);

    const newPublic = path.join(tmpDir, "dist", "public");
    const newServer = path.join(tmpDir, "server");

    if (!fs.existsSync(newPublic) || !fs.existsSync(newServer)) {
      throw new Error("Update ZIP is missing dist/public or server directories");
    }

    const targetPublic = path.join(appPath, "dist", "public");
    const targetServer = path.join(appPath, "server");

    console.log("[Updater] Replacing files...");
    rmSync(targetPublic);
    fs.cpSync(newPublic, targetPublic, { recursive: true });

    rmSync(targetServer);
    fs.cpSync(newServer, targetServer, { recursive: true });

    const pkgPath = path.join(appPath, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    console.log("[Updater] Cleaning up...");
    try { fs.unlinkSync(zipPath); } catch {}
    rmSync(tmpDir);

    console.log("[Updater] Update applied successfully.");
    return true;
  } catch (err) {
    rmSync(tmpDir);
    throw err;
  }
}

async function checkForUpdates(silent = true) {
  try {
    console.log(
      `[Updater] Checking for updates... Current version: ${CURRENT_VERSION}`,
    );
    const latest = await fetchLatestRelease();
    console.log(`[Updater] Latest version: ${latest.version}`);

    if (compareVersions(latest.version, CURRENT_VERSION) > 0) {
      console.log(`[Updater] Update available: ${latest.version}`);

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

      if (result.response === 0) {
        const progressWin = BrowserWindow.getFocusedWindow();
        if (progressWin) {
          progressWin.setProgressBar(0.5);
        }

        try {
          await applyUpdate(latest.downloadUrl, latest.version);

          if (progressWin) progressWin.setProgressBar(-1);

          app.relaunch();
          app.exit(0);
        } catch (err) {
          if (progressWin) progressWin.setProgressBar(-1);
          console.error("[Updater] Install failed:", err.message);
          dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
            type: "error",
            title: "Update Failed",
            message: "Could not install the update.",
            detail: err.message,
          });
        }
      }
    } else if (!silent) {
      dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "info",
        title: "No Updates",
        message: "You're running the latest version!",
        detail: `Current version: v${CURRENT_VERSION}`,
      });
    } else {
      console.log("[Updater] App is up to date.");
    }
  } catch (error) {
    console.error("[Updater] Error checking for updates:", error.message);
    if (!silent) {
      const isRateLimit = error.message && error.message.includes("Rate limited");
      dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "error",
        title: "Update Check Failed",
        message: "Could not check for updates.",
        detail: isRateLimit
          ? error.message
          : "Please check your network connection and try again.",
      });
    }
  }
}

module.exports = { checkForUpdates };
