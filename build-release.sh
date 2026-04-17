#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./build-release.sh <version>"
  echo "  e.g. ./build-release.sh 2.1.0"
  exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELEASES_DIR="${SCRIPT_DIR}/releases"
STAGING_DIR="${SCRIPT_DIR}/.release-staging"
UPDATE_ZIP="lower-thirds-update-v${VERSION}.zip"
DMG_NAME="Lower Thirds Generator-${VERSION}-arm64"

echo "==> Building release v${VERSION}"
echo ""

# ── Validate prerequisites ───────────────────────────────────────────────────

if [ ! -d "${SCRIPT_DIR}/dist/public" ]; then
  echo "ERROR: dist/public not found. Run 'pnpm run build' first."
  exit 1
fi

if [ ! -d "${SCRIPT_DIR}/server" ]; then
  echo "ERROR: server/ directory not found."
  exit 1
fi

# ── Clean ─────────────────────────────────────────────────────────────────────

rm -rf "${STAGING_DIR}"
mkdir -p "${RELEASES_DIR}"

# ── 1. Update package (delta: dist/public + server) ──────────────────────────

echo "==> Building update package..."
mkdir -p "${STAGING_DIR}/update/dist" "${STAGING_DIR}/update/server" "${STAGING_DIR}/update/electron"

cp -r "${SCRIPT_DIR}/dist/public" "${STAGING_DIR}/update/dist/"

cp -r "${SCRIPT_DIR}/server/"*.js "${STAGING_DIR}/update/server/" 2>/dev/null || true
for subdir in middleware routes state; do
  if [ -d "${SCRIPT_DIR}/server/${subdir}" ]; then
    cp -r "${SCRIPT_DIR}/server/${subdir}" "${STAGING_DIR}/update/server/"
  fi
done

if [ -d "${SCRIPT_DIR}/electron" ]; then
  cp -r "${SCRIPT_DIR}/electron/." "${STAGING_DIR}/update/electron/"
fi

cp "${SCRIPT_DIR}/package.json" "${STAGING_DIR}/update/package.json"

cd "${STAGING_DIR}/update"
zip -r "${RELEASES_DIR}/${UPDATE_ZIP}" dist/ server/ electron/ package.json -x '*.DS_Store'
cd "${SCRIPT_DIR}"

# ── 2. Electron app + DMG ────────────────────────────────────────────────────

echo "==> Building Electron app (.app bundle)..."
npx electron-builder --mac --publish never

echo "==> Creating DMG installer..."
bash "${SCRIPT_DIR}/build/create-dmg.sh" "${VERSION}"

DMG_SRC="${SCRIPT_DIR}/dist/${DMG_NAME}.dmg"
DMG_DEST="${RELEASES_DIR}/${DMG_NAME}.dmg"

if [ ! -f "${DMG_SRC}" ]; then
  echo "ERROR: DMG was not created at ${DMG_SRC}"
  exit 1
fi

cp "${DMG_SRC}" "${DMG_DEST}"

# ── Compute sizes ────────────────────────────────────────────────────────────

if [[ "$OSTYPE" == "darwin"* ]]; then
  UPDATE_SIZE=$(stat -f%z "${RELEASES_DIR}/${UPDATE_ZIP}")
  DMG_SIZE=$(stat -f%z "${DMG_DEST}")
else
  UPDATE_SIZE=$(stat -c%s "${RELEASES_DIR}/${UPDATE_ZIP}")
  DMG_SIZE=$(stat -c%s "${DMG_DEST}")
fi

UPDATE_MB=$(echo "scale=1; ${UPDATE_SIZE} / 1048576" | bc)
DMG_MB=$(echo "scale=1; ${DMG_SIZE} / 1048576" | bc)

# ── Clean up ─────────────────────────────────────────────────────────────────

rm -rf "${STAGING_DIR}"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "==> Release v${VERSION} built successfully!"
echo ""
echo "    UPDATE PACKAGE (for GitHub Releases):"
echo "      releases/${UPDATE_ZIP}  (${UPDATE_MB} MB)"
echo ""
echo "    DMG INSTALLER (for distribution):"
echo "      releases/${DMG_NAME}.dmg  (${DMG_MB} MB)"
echo ""
