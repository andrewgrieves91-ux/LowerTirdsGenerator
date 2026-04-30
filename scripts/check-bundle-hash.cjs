#!/usr/bin/env node
/*
 * scripts/check-bundle-hash.cjs
 *
 * Guards the patches/* string-replacement scripts against a silent rebuild of
 * the renderer bundle. Exits non-zero if:
 *   - patches/.bundle-pin is missing
 *   - dist/public/assets contains a different number of bundle files than expected
 *   - the bundle filename or sha256 doesn't match the pin
 *
 * Wired as a pretest hook in package.json. Also safe to run by hand:
 *   node scripts/check-bundle-hash.cjs
 *
 * If the bundle was rebuilt intentionally, follow patches/README.md
 * "Unpin and repin" — short version: re-author each affected patch against the
 * new bundle, then run `node scripts/check-bundle-hash.cjs --update` to refresh
 * the pin file.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const PIN_PATH = path.join(ROOT, "patches", ".bundle-pin");
const BUNDLE_DIR = path.join(ROOT, "dist", "public", "assets");

function fail(msg) {
  console.error(`\n[bundle-pin] ${msg}\n`);
  process.exit(1);
}

function readPin() {
  if (!fs.existsSync(PIN_PATH)) {
    fail(
      `Missing patches/.bundle-pin.\n` +
      `Create it with: node scripts/check-bundle-hash.cjs --update`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(PIN_PATH, "utf-8"));
  } catch (err) {
    fail(`patches/.bundle-pin is not valid JSON: ${err.message}`);
  }
}

function findBundles() {
  if (!fs.existsSync(BUNDLE_DIR)) return [];
  return fs
    .readdirSync(BUNDLE_DIR)
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));
}

function sha256OfFile(p) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(p));
  return hash.digest("hex");
}

function check() {
  const pin = readPin();
  const bundles = findBundles();

  if (bundles.length === 0) {
    fail(
      `No bundles found in ${path.relative(ROOT, BUNDLE_DIR)}.\n` +
      `Expected exactly one file matching index-*.js.`,
    );
  }
  if (bundles.length > 1) {
    fail(
      `Multiple bundles found in ${path.relative(ROOT, BUNDLE_DIR)}:\n` +
      bundles.map((b) => `    ${b}`).join("\n") +
      `\nExpected exactly one. Delete the stale bundles or re-pin.`,
    );
  }

  const [filename] = bundles;
  if (filename !== pin.filename) {
    fail(
      `Bundle filename mismatch.\n` +
      `  pinned:  ${pin.filename}\n` +
      `  on disk: ${filename}\n\n` +
      `The renderer was rebuilt with a different content hash. Every script\n` +
      `in patches/ targets ${pin.filename} by name and will silently fail\n` +
      `against ${filename}. You must re-author or re-anchor each affected\n` +
      `patch, then refresh the pin:\n` +
      `    node scripts/check-bundle-hash.cjs --update\n`,
    );
  }

  const bundlePath = path.join(BUNDLE_DIR, filename);
  const actualHash = sha256OfFile(bundlePath);
  if (actualHash !== pin.sha256) {
    fail(
      `Bundle content hash mismatch for ${filename}.\n` +
      `  pinned:  ${pin.sha256}\n` +
      `  on disk: ${actualHash}\n\n` +
      `The bundle byte stream changed. If this was intentional (you ran\n` +
      `\`node patches/apply-all.cjs\` and got new output), refresh the pin:\n` +
      `    node scripts/check-bundle-hash.cjs --update\n` +
      `If it wasn't intentional, the bundle was rebuilt outside of the\n` +
      `patch flow and your patches probably no longer apply.`,
    );
  }

  console.log(
    `[bundle-pin] ok: ${filename} matches pin (sha256 ${actualHash.slice(0, 12)}...)`,
  );
}

function update() {
  const bundles = findBundles();
  if (bundles.length !== 1) {
    fail(
      `--update requires exactly one bundle in ${path.relative(ROOT, BUNDLE_DIR)}.\n` +
      `Found ${bundles.length}.`,
    );
  }
  const [filename] = bundles;
  const bundlePath = path.join(BUNDLE_DIR, filename);
  const sha256 = sha256OfFile(bundlePath);
  const size = fs.statSync(bundlePath).size;

  let existingNote = null;
  try {
    existingNote = JSON.parse(fs.readFileSync(PIN_PATH, "utf-8")).note;
  } catch { /* ignore */ }

  const pin = {
    filename,
    sha256,
    size,
    note:
      existingNote ||
      "Pinned bundle hash. patches/* are written against this exact byte stream. If the bundle is rebuilt and this hash changes, every patch's string.replace will silently fail and the app will ship broken. See patches/README.md for the unpin/repin workflow.",
  };
  fs.writeFileSync(PIN_PATH, JSON.stringify(pin, null, 2) + "\n");
  console.log(`[bundle-pin] updated:`);
  console.log(`  filename: ${filename}`);
  console.log(`  sha256:   ${sha256}`);
  console.log(`  size:     ${size} bytes`);
}

if (process.argv.includes("--update")) {
  update();
} else {
  check();
}
