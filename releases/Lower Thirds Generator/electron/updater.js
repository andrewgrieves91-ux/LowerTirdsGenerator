const { app, dialog, shell, BrowserWindow, net } = require("electron");

const LATEST_JSON_FILE_ID = "1aRW2JdgWAL0EDd3a1hiED4J0mfHcHhsH";
const UPDATE_CHECK_URL = `https://drive.google.com/uc?export=download&id=${LATEST_JSON_FILE_ID}`;

const CURRENT_VERSION = app.getVersion();

function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((partsA[i] || 0) > (partsB[i] || 0)) return 1;
    if ((partsA[i] || 0) < (partsB[i] || 0)) return -1;
  }
  return 0;
}

function fetchLatestInfo() {
  return new Promise((resolve, reject) => {
    const request = net.request(UPDATE_CHECK_URL);
    let data = "";

    request.on("response", (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const target = Array.isArray(redirectUrl)
            ? redirectUrl[0]
            : redirectUrl;
          const redirectRequest = net.request(target);
          let redirectData = "";
          redirectRequest.on("response", (res) => {
            res.on("data", (chunk) => {
              redirectData += chunk.toString();
            });
            res.on("end", () => {
              try {
                resolve(JSON.parse(redirectData));
              } catch {
                reject(new Error("Failed to parse update info"));
              }
            });
          });
          redirectRequest.on("error", reject);
          redirectRequest.end();
          return;
        }
      }

      response.on("data", (chunk) => {
        data += chunk.toString();
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse update info"));
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
    const latest = await fetchLatestInfo();
    console.log(`[Updater] Latest version: ${latest.version}`);

    if (compareVersions(latest.version, CURRENT_VERSION) > 0) {
      console.log(`[Updater] Update available: ${latest.version}`);

      const result = await dialog.showMessageBox(
        BrowserWindow.getFocusedWindow(),
        {
          type: "info",
          title: "Update Available",
          message: `LTG v${latest.version} is available!`,
          detail: `You have v${CURRENT_VERSION}.\n\nRelease notes:\n${latest.releaseNotes || latest.notes || ""}`,
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
