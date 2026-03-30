#!/bin/bash
# Lower Thirds Generator — Offline Launcher (ChromeOS / Crostini)
# Run from terminal: bash launch-chromeos.sh
set -e
# Change to the directory containing this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
# ── Check for Node.js ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is not installed."
  echo ""
  echo "Install it with:"
  echo "  sudo apt update && sudo apt install -y nodejs npm"
  echo ""
  echo "Or download from: https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js v${NODE_VER} is too old. Please install Node.js 18 or later."
  exit 1
fi
# ── Install dependencies if needed ────────────────────────────────────────────
if [ ! -d "$DIR/node_modules/express" ]; then
  echo "Installing dependencies (first run only)..."
  npm install --omit=dev --silent
fi
# ── Find a free port starting at 3000 ─────────────────────────────────────────
PORT=3000
while ss -tlnp 2>/dev/null | grep -q ":$PORT " || lsof -i :"$PORT" &>/dev/null 2>&1; do
  PORT=$((PORT + 1))
done
export PORT
# ── Open browser after a short delay ──────────────────────────────────────────
(sleep 1.5 && (xdg-open "http://localhost:$PORT" 2>/dev/null || google-chrome "http://localhost:$PORT" 2>/dev/null || chromium-browser "http://localhost:$PORT" 2>/dev/null || true)) &
# ── Start the server ──────────────────────────────────────────────────────────
echo "Starting Lower Thirds Generator on http://localhost:$PORT"
echo "Open your browser to: http://localhost:$PORT"
echo "Press Ctrl+C to stop."
node dist/index.js
