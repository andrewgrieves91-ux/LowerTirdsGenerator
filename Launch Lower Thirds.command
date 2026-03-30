#!/bin/bash
# Lower Thirds Generator — Offline Launcher (macOS)
# Double-click this file to start the app.
# If macOS blocks it: right-click → Open → Open

set -e

# Change to the directory containing this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# ── Check for Node.js ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  osascript -e 'display dialog "Node.js is not installed.\n\nPlease download and install it from:\nhttps://nodejs.org\n\nThen double-click this launcher again." buttons {"OK"} default button "OK" with icon stop with title "Lower Thirds Generator"'
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$MAJOR" -lt 18 ]; then
  osascript -e "display dialog \"Node.js v${NODE_VER} is too old.\n\nPlease install Node.js 18 or later from:\nhttps://nodejs.org\" buttons {\"OK\"} default button \"OK\" with icon stop with title \"Lower Thirds Generator\""
  exit 1
fi

# ── Install dependencies if needed ────────────────────────────────────────────
if [ ! -d "$DIR/node_modules/express" ]; then
  echo "Installing dependencies (first run only)..."
  npm install --omit=dev --silent
fi

# ── Find a free port starting at 3000 ─────────────────────────────────────────
PORT=3000
while lsof -i :"$PORT" &>/dev/null 2>&1; do
  PORT=$((PORT + 1))
done
export PORT

# ── Open browser after a short delay ──────────────────────────────────────────
(sleep 1.5 && open "http://localhost:$PORT") &

# ── Start the server ──────────────────────────────────────────────────────────
echo "Starting Lower Thirds Generator on http://localhost:$PORT"
echo "Close this window to stop the server."
node dist/index.js
