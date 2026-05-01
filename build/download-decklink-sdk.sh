#!/usr/bin/env bash
#
# build/download-decklink-sdk.sh
#
# Vendors the Blackmagic DeckLink SDK headers + DeckLinkAPIDispatch.cpp into
# electron/native/decklink-output/include/ so the native addon can be built.
#
# Blackmagic do not host the SDK behind a stable, license-free download URL
# (you must accept their license at the Blackmagic Support page), so this
# script does NOT auto-download the SDK over the network. Instead it locates
# an already-extracted SDK in the typical user folders and copies the bits
# we need.
#
# Usage:
#   bash build/download-decklink-sdk.sh                         # auto-locate
#   bash build/download-decklink-sdk.sh /path/to/SDK            # explicit path
#
# Idempotent: if the headers already live in the include/ directory and look
# valid, the script exits cleanly without copying.
#
# How to obtain the SDK (one-time, free):
#   1. Visit https://www.blackmagicdesign.com/support/family/capture-and-playback
#   2. Find "Desktop Video SDK" for Mac and click Download.
#   3. Fill in name + email, accept the license.
#   4. Unzip the downloaded archive (it lands somewhere like
#      ~/Downloads/Blackmagic_DeckLink_SDK_<version>/).
#   5. Re-run this script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INCLUDE_DIR="$REPO_ROOT/electron/native/decklink-output/include"

log() { printf "[decklink-sdk] %s\n" "$*" >&2; }

# Required files we copy out of <SDK>/Mac/include/
REQUIRED_HEADERS=(
  "DeckLinkAPI.h"
  "DeckLinkAPITypes.h"
  "DeckLinkAPIModes.h"
  "DeckLinkAPIVersion.h"
  "DeckLinkAPIDispatch.cpp"
)

mkdir -p "$INCLUDE_DIR"

# ─── idempotency ──────────────────────────────────────────────────────────
all_present=true
for f in "${REQUIRED_HEADERS[@]}"; do
  if [[ ! -s "$INCLUDE_DIR/$f" ]]; then
    all_present=false
    break
  fi
done

if $all_present; then
  log "SDK headers already vendored in $INCLUDE_DIR — skipping."
  exit 0
fi

# ─── locate SDK ──────────────────────────────────────────────────────────
candidate_roots=()
if [[ $# -ge 1 ]]; then
  candidate_roots+=("$1")
fi
candidate_roots+=(
  "$HOME/Downloads"
  "$HOME/Desktop"
  "$HOME/Documents"
  "/Applications"
)

SDK_ROOT=""
for root in "${candidate_roots[@]}"; do
  [[ -d "$root" ]] || continue
  # Match Blackmagic_DeckLink_SDK_<version>/ or Blackmagic DeckLink SDK <version>/
  while IFS= read -r -d '' candidate; do
    if [[ -f "$candidate/Mac/include/DeckLinkAPI.h" ]]; then
      SDK_ROOT="$candidate"
      break 2
    fi
  done < <(find "$root" -maxdepth 3 -type d \( -iname "Blackmagic_DeckLink_SDK*" -o -iname "Blackmagic DeckLink SDK*" \) -print0 2>/dev/null)
done

if [[ -z "$SDK_ROOT" ]]; then
  cat >&2 <<MSG

[decklink-sdk] ERROR: Blackmagic DeckLink SDK not found.

The native DeckLink output addon needs the SDK headers (one-time, free):

  1. Visit https://www.blackmagicdesign.com/support/family/capture-and-playback
  2. Find "Desktop Video SDK" for Mac and click Download.
  3. Fill in name + email, accept the Blackmagic license.
  4. Unzip the archive (typically lands in ~/Downloads/).
  5. Re-run:
       bash build/download-decklink-sdk.sh
     or pass an explicit path:
       bash build/download-decklink-sdk.sh /path/to/Blackmagic_DeckLink_SDK_*

The SDK is not redistributable — that's why this repo does not vendor it
directly and why the script can't auto-download it.

MSG
  exit 1
fi

log "found SDK: $SDK_ROOT"

# ─── copy required files ─────────────────────────────────────────────────
SRC_INCLUDE="$SDK_ROOT/Mac/include"
if [[ ! -d "$SRC_INCLUDE" ]]; then
  log "ERROR: $SRC_INCLUDE does not exist (corrupted SDK extract?)"
  exit 1
fi

for f in "${REQUIRED_HEADERS[@]}"; do
  if [[ ! -f "$SRC_INCLUDE/$f" ]]; then
    log "ERROR: required file missing in SDK: $SRC_INCLUDE/$f"
    exit 1
  fi
  install -m 0644 "$SRC_INCLUDE/$f" "$INCLUDE_DIR/$f"
  log "  copied $f"
done

# Some SDK versions split modes/configuration enums across additional headers
# included by DeckLinkAPI.h. Copy any that exist (best-effort, no failure).
for extra in DeckLinkAPIConfiguration.h DeckLinkAPIDeckControl.h DeckLinkAPIDiscovery.h DeckLinkAPIStreaming.h DeckLinkAPIProfileAttributes.h DeckLinkAPIDispatch_v*.h; do
  if [[ -f "$SRC_INCLUDE/$extra" ]]; then
    install -m 0644 "$SRC_INCLUDE/$extra" "$INCLUDE_DIR/$extra"
    log "  copied $extra (extra)"
  fi
done

# Handle wildcard expansion for versioned dispatch headers
shopt -s nullglob
for vh in "$SRC_INCLUDE"/*.h; do
  base="$(basename "$vh")"
  case "$base" in
    DeckLinkAPI*.h)
      [[ -f "$INCLUDE_DIR/$base" ]] && continue
      install -m 0644 "$vh" "$INCLUDE_DIR/$base"
      log "  copied $base (auto)"
      ;;
  esac
done
shopt -u nullglob

# Vendor the LICENSE notice next to the headers so attribution travels with
# the binary build artefact.
if [[ -f "$SDK_ROOT/Documents/License.rtf" ]]; then
  install -m 0644 "$SDK_ROOT/Documents/License.rtf" "$INCLUDE_DIR/SDK-License.rtf"
elif [[ -f "$SDK_ROOT/License.rtf" ]]; then
  install -m 0644 "$SDK_ROOT/License.rtf" "$INCLUDE_DIR/SDK-License.rtf"
fi

log "OK — vendored $(ls "$INCLUDE_DIR" | wc -l | tr -d ' ') file(s) into $INCLUDE_DIR"
log "next: npm run decklink:build"
