const { app, dialog, shell, BrowserWindow, net } = require("electron");
const path = require("path");
const fs = require("fs");

const GITHUB_API_URL =
  "https://api.github.com/repos/andrewgrieves91-ux/LowerTirdsGenerator/releases/latest";

const CURRENT_VERSION = app.getVersion();

function compareVersions(a, b) {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
    if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
  }
  return 0;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: GITHUB_API_URL,
      headers: {
        "User-Agent": "LowerThirdsGenerator",
        Accept: "application/vnd.github.v3+json",
      },
    });

    let data = "";

    request.on("response", (response) => {
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
          const version = (release.tag_name || "").replace(/^v/, "");
          const notes = release.body || "";
          const asset = (release.assets || []).find((a) =>
            a.name.endsWith(".zip"),
          );
          const downloadUrl = asset
            ? asset.browser_download_url
            : release.html_url;

          resolve({ version, notes, downloadUrl });
        } catch {
          reject(new Error("Failed to parse GitHub release info"));
        }
      });
    });

    request.on("error", reject);
    request.end();
  });
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
          buttons: ["Download Update", "Later"],
          defaultId: 0,
          cancelId: 1,
        },
      );

      if (result.response === 0) {
        shell.openExternal(latest.downloadUrl);
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
      dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: "error",
        title: "Update Check Failed",
        message: "Could not check for updates.",
        detail: "Please check your network connection and try again.",
      });
    }
  }
}

module.exports = { checkForUpdates };
