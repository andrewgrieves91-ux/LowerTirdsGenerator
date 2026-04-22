#!/usr/bin/env bash
#
# build/download-ffmpeg.sh
#
# Fetches a static macOS arm64 ffmpeg binary and places it at
# electron/bin/ffmpeg. Invoked automatically before electron-builder
# via the `build:mac` npm script. Idempotent — if a working ffmpeg
# already lives at the destination, exit immediately.
#
# Sources (tried in order):
#   1. osxexperts.net  — clean arm64-specific URLs, long-running
#   2. evermeet.cx     — redirect-based, also reliable
#
# The binary is only used at build time to be packaged into the .app
# bundle. End-user machines never touch the network for ffmpeg.
#
# FFmpeg is distributed under GPLv3 (because this static build
# includes libx264 and other GPL-licensed libraries). We also write
# a LICENSE notice next to the binary so the packaged app has clear
# attribution.

set -euo pipefail

# ─── config ───────────────────────────────────────────────────────────────
FFMPEG_VERSION="7.1"
# osxexperts URLs are keyed by major version for 7.x; the file name encodes it
# as e.g. ffmpeg71arm.zip (7.1, arm64).
PRIMARY_URL="https://www.osxexperts.net/ffmpeg71arm.zip"
FALLBACK_URL="https://evermeet.cx/ffmpeg/ffmpeg-${FFMPEG_VERSION}.zip"

# Resolve repo root (script lives in build/, repo root is parent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$REPO_ROOT/electron/bin"
BIN_PATH="$BIN_DIR/ffmpeg"
LICENSE_PATH="$BIN_DIR/ffmpeg-LICENSE.txt"

log() { printf "[download-ffmpeg] %s\n" "$*" >&2; }

# ─── idempotency ──────────────────────────────────────────────────────────
if [[ -x "$BIN_PATH" ]]; then
  if "$BIN_PATH" -version >/dev/null 2>&1; then
    log "ffmpeg already present and working at $BIN_PATH — skipping download"
    exit 0
  else
    log "existing binary at $BIN_PATH is not executable/usable — re-downloading"
    rm -f "$BIN_PATH"
  fi
fi

mkdir -p "$BIN_DIR"

# ─── download with fallback ───────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download_from() {
  local url="$1"
  local out="$TMP_DIR/ffmpeg.zip"
  log "fetching from $url"
  if curl --fail --location --silent --show-error \
          --connect-timeout 15 --max-time 600 \
          --output "$out" "$url"; then
    echo "$out"
    return 0
  fi
  return 1
}

ZIP=""
if ZIP="$(download_from "$PRIMARY_URL")"; then
  :
elif ZIP="$(download_from "$FALLBACK_URL")"; then
  :
else
  log "ERROR: failed to download ffmpeg from all sources."
  log "Manual install: download an arm64 macOS ffmpeg, drop it at"
  log "  $BIN_PATH   (and chmod +x it), then re-run the build."
  exit 1
fi

# ─── extract ──────────────────────────────────────────────────────────────
log "extracting $ZIP"
(cd "$TMP_DIR" && unzip -q "$ZIP")

# Both evermeet and osxexperts zips contain a single file "ffmpeg" at root,
# possibly plus other files. Find it.
EXTRACTED="$(find "$TMP_DIR" -type f -name ffmpeg -perm +111 2>/dev/null | head -1 || true)"
if [[ -z "$EXTRACTED" ]]; then
  EXTRACTED="$(find "$TMP_DIR" -type f -name ffmpeg 2>/dev/null | head -1 || true)"
fi
if [[ -z "$EXTRACTED" ]]; then
  log "ERROR: could not locate extracted ffmpeg binary in $TMP_DIR"
  log "Archive contents:"
  find "$TMP_DIR" -type f | head -20
  exit 1
fi

# ─── install + verify ─────────────────────────────────────────────────────
install -m 0755 "$EXTRACTED" "$BIN_PATH"

if ! "$BIN_PATH" -version >/dev/null 2>&1; then
  log "ERROR: downloaded ffmpeg at $BIN_PATH is not runnable."
  log "This can happen on arm64 Macs if the binary is x86_64 — verify archive source."
  file "$BIN_PATH" || true
  exit 1
fi

ARCH="$(file -b "$BIN_PATH" 2>/dev/null | head -1 || echo unknown)"
VERSION_LINE="$("$BIN_PATH" -version 2>/dev/null | head -1)"
log "installed: $BIN_PATH"
log "  arch:    $ARCH"
log "  version: $VERSION_LINE"

# ─── license notice ───────────────────────────────────────────────────────
cat > "$LICENSE_PATH" <<'LICENSE'
This application bundles FFmpeg (https://ffmpeg.org/), a free software
project under the GNU General Public License v3 (GPLv3) due to the
inclusion of libx264 and other GPL-licensed components.

The bundled binary is built and redistributed without modification from
a trusted upstream source (see build/download-ffmpeg.sh in the source
repository for the exact URL and pinned version).

Full source code for FFmpeg is available at https://ffmpeg.org/download.html.
A copy of the GPLv3 license is available at https://www.gnu.org/licenses/gpl-3.0.html.

No modifications have been made to the FFmpeg source or binary by this
application. FFmpeg is used as a command-line tool, not linked into our
own code.
LICENSE
log "wrote $LICENSE_PATH"

log "OK"
