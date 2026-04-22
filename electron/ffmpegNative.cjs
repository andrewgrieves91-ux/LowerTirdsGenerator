/*
 * electron/ffmpegNative.cjs
 *
 * Tier C1: native ffmpeg binary invocation for the Export page.
 *
 * Detects a system ffmpeg binary on the machine (Homebrew, Linux pkg,
 * manual install). When present, the Export page prefers it over the
 * ffmpeg-wasm fallback — gives 10-50x faster encoding, works with
 * zero network access, and produces correctly-tagged ProRes / QT-RLE
 * without the byte-level patching that the WASM path needs.
 *
 * API used from main.cjs:
 *   detectFFmpeg()           → absolute path to ffmpeg, or null
 *   initSession(id)          → creates temp dir, returns { tempDir }
 *   writeFrame(id, i, buf)   → writes PNG to temp dir
 *   runFFmpeg(id, args, out, onProgress) → spawns ffmpeg, resolves with output Buffer
 *   cleanup(id)              → removes temp dir
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execSync } = require("node:child_process");

let _detectCache = undefined;

function detectFFmpeg() {
  if (_detectCache !== undefined) return _detectCache;
  // Bundled binary shipped inside the .app (downloaded at build time via
  // build/download-ffmpeg.sh). `__dirname` resolves to electron/ in both
  // development and production because build.asar is false. This is always
  // the preferred location — guarantees consistent ffmpeg version across
  // every machine that runs the app, no matter what the user has in PATH.
  const BUNDLED = path.join(__dirname, "bin", "ffmpeg");
  const tryPaths = [
    BUNDLED,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
  ];
  for (const p of tryPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      // Ensure the bundled binary is executable. electron-builder normally
      // preserves mode bits, but a fresh clone on Windows/exotic filesystems
      // can lose the +x. Cheap and safe — runs once per process.
      if (p === BUNDLED) {
        try { fs.chmodSync(p, 0o755); } catch (_) {}
      }
      _detectCache = p;
      return p;
    } catch (_) {}
  }
  try {
    const cmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const out = execSync(cmd, { encoding: "utf8", timeout: 2000 }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) { _detectCache = out; return out; }
  } catch (_) {}
  _detectCache = null;
  return null;
}

const _sessions = new Map();

function initSession(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("initSession: sessionId must be a non-empty string");
  }
  if (_sessions.has(sessionId)) {
    // idempotent re-init — reuse existing temp dir
    return { tempDir: _sessions.get(sessionId).tempDir };
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ltg-export-"));
  _sessions.set(sessionId, { tempDir, frameCount: 0 });
  return { tempDir };
}

function writeFrame(sessionId, index, buf) {
  const s = _sessions.get(sessionId);
  if (!s) throw new Error("writeFrame: unknown sessionId " + sessionId);
  const name = `fr_${String(index).padStart(6, "0")}.png`;
  const payload = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  fs.writeFileSync(path.join(s.tempDir, name), payload);
  s.frameCount++;
}

/**
 * args: array of ffmpeg CLI args. Input patterns like `fr_%06d.png`
 * and the output file name are resolved relative to the session tempDir.
 * onProgress: called with seconds (float) as ffmpeg reports time=... in stderr.
 */
function runFFmpeg(sessionId, args, outName, onProgress) {
  const s = _sessions.get(sessionId);
  if (!s) return Promise.reject(new Error("runFFmpeg: unknown sessionId " + sessionId));
  const bin = detectFFmpeg();
  if (!bin) return Promise.reject(new Error("ffmpeg binary not found"));

  // Rewrite arg paths: any arg equal to outName or matching an input pattern
  // is joined with tempDir. Everything else passed through verbatim.
  const resolveArg = (a) => {
    if (a === outName) return path.join(s.tempDir, outName);
    if (typeof a === "string" && a.includes("%0") && a.endsWith(".png")) {
      return path.join(s.tempDir, a);
    }
    return a;
  };
  const fullArgs = ["-y", ...args.map(resolveArg)];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, fullArgs, { cwd: s.tempDir });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      const str = chunk.toString();
      stderr += str;
      if (onProgress) {
        const m = /time=(\d+):(\d+):(\d+)\.(\d+)/.exec(str);
        if (m) {
          const sec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60
            + parseInt(m[3]) + parseInt(m[4]) / 100;
          try { onProgress(sec); } catch (_) {}
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
        return;
      }
      try {
        const out = fs.readFileSync(path.join(s.tempDir, outName));
        resolve(out);
      } catch (e) { reject(e); }
    });
  });
}

function cleanup(sessionId) {
  const s = _sessions.get(sessionId);
  if (!s) return;
  try { fs.rmSync(s.tempDir, { recursive: true, force: true }); } catch (_) {}
  _sessions.delete(sessionId);
}

module.exports = {
  detectFFmpeg,
  initSession,
  writeFrame,
  runFFmpeg,
  cleanup,
};
