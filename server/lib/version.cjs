"use strict";

const fs = require("fs");
const path = require("path");

// CommonJS so it can be required by both the ESM server and the CJS Electron
// main process. The browser-side overlay keeps its own copy of compareVersions
// because it runs in a sandboxed <script> context with no module system.

/**
 * Compare two semver-style x.y.z version strings.
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if equal
 *
 * Tolerates a leading "v" prefix on either side. Missing components default
 * to 0 (so "1.2" compares equal to "1.2.0").
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

const ROOT_PACKAGE_JSON = path.resolve(__dirname, "..", "..", "package.json");

/**
 * Read the local app version from package.json at the repo root.
 *
 * @param {string} [pkgPath] override for tests
 * @returns {Promise<{ version: string, updateUrl: string }>}
 */
async function getLocalVersion(pkgPath = ROOT_PACKAGE_JSON) {
  const raw = await fs.promises.readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  return { version: pkg.version, updateUrl: pkg.updateUrl || "" };
}

module.exports = { compareVersions, getLocalVersion };
