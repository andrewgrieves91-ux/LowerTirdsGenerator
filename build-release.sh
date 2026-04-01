#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./build-release.sh <version> [server-url]"
  echo "  e.g. ./build-release.sh 2.1.0 https://elecupdate-7jgymmnn.manus.space"
  exit 1
fi

VERSION="$1"
SERVER_URL="${2:-https://elecupdate-7jgymmnn.manus.space}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="lower-thirds-v${VERSION}.zip"
RELEASES_DIR="${SCRIPT_DIR}/releases"
STAGING_DIR="${SCRIPT_DIR}/.release-staging"

echo "==> Building release v${VERSION}"

# Clean previous staging
rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}/dist" "${STAGING_DIR}/server" "${RELEASES_DIR}"

# Copy dist/public (the Vite build output)
if [ ! -d "${SCRIPT_DIR}/dist/public" ]; then
  echo "ERROR: dist/public not found. Run 'pnpm run build' first."
  exit 1
fi
echo "==> Copying dist/public..."
cp -r "${SCRIPT_DIR}/dist/public" "${STAGING_DIR}/dist/"

# Copy modular server
if [ ! -d "${SCRIPT_DIR}/server" ]; then
  echo "ERROR: server/ directory not found."
  exit 1
fi
echo "==> Copying server/..."
cp -r "${SCRIPT_DIR}/server/"*.js "${STAGING_DIR}/server/" 2>/dev/null || true
for subdir in middleware routes state; do
  if [ -d "${SCRIPT_DIR}/server/${subdir}" ]; then
    cp -r "${SCRIPT_DIR}/server/${subdir}" "${STAGING_DIR}/server/"
  fi
done

# Create ZIP
echo "==> Creating ${OUT}..."
cd "${STAGING_DIR}"
zip -r "${RELEASES_DIR}/${OUT}" dist/ server/ -x '*.DS_Store'
cd "${SCRIPT_DIR}"

# Compute SHA256 and file size (cross-platform)
if command -v shasum &>/dev/null; then
  SHA=$(shasum -a 256 "${RELEASES_DIR}/${OUT}" | awk '{print $1}')
elif command -v sha256sum &>/dev/null; then
  SHA=$(sha256sum "${RELEASES_DIR}/${OUT}" | awk '{print $1}')
else
  echo "ERROR: No SHA256 tool found (need shasum or sha256sum)"
  exit 1
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  SIZE=$(stat -f%z "${RELEASES_DIR}/${OUT}")
else
  SIZE=$(stat -c%s "${RELEASES_DIR}/${OUT}")
fi

# Write manifest.json
RELEASE_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "${RELEASES_DIR}/manifest.json" <<EOF
{
  "version": "${VERSION}",
  "releaseDate": "${RELEASE_DATE}",
  "downloadUrl": "${SERVER_URL}/releases/${OUT}",
  "sha256": "${SHA}",
  "sizeBytes": ${SIZE},
  "notes": "Release v${VERSION}",
  "minNodeVersion": "18.0.0"
}
EOF

# Clean up
rm -rf "${STAGING_DIR}"

echo ""
echo "==> Release built successfully!"
echo "    ZIP:      releases/${OUT}"
echo "    Manifest: releases/manifest.json"
echo "    SHA256:   ${SHA}"
echo "    Size:     ${SIZE} bytes"
echo ""
echo "Upload both files to ${SERVER_URL}:"
echo "  - ${SERVER_URL}/manifest.json"
echo "  - ${SERVER_URL}/releases/${OUT}"
