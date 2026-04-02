#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: ./build-release.sh <version>"
  echo "  e.g. ./build-release.sh 2.1.0"
  exit 1
fi

VERSION="$1"
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

# Write latest.json (to be uploaded to Google Drive)
RELEASE_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "${RELEASES_DIR}/latest.json" <<EOF
{
  "version": "${VERSION}",
  "releaseDate": "${RELEASE_DATE}",
  "downloadUrl": "https://drive.google.com/uc?export=download&id=REPLACE_WITH_ZIP_FILE_ID",
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
echo "    Manifest: releases/latest.json"
echo "    SHA256:   ${SHA}"
echo "    Size:     ${SIZE} bytes"
echo ""
echo "==> Google Drive upload steps:"
echo ""
echo "  1. Upload releases/${OUT} to Google Drive"
echo "     - Right-click → Share → 'Anyone with the link' → Copy link"
echo "     - Extract the file ID from the link (the part after /d/ and before /view)"
echo ""
echo "  2. Edit releases/latest.json"
echo "     - Replace REPLACE_WITH_ZIP_FILE_ID with the actual file ID from step 1"
echo "     - Update the 'notes' field with your release notes"
echo ""
echo "  3. Upload/replace latest.json on Google Drive"
echo "     - Keep the SAME file (replace contents) so the file ID stays the same"
echo "     - Make sure sharing is set to 'Anyone with the link'"
echo ""
echo "  4. Update package.json 'updateUrl' with the latest.json file ID (first time only)"
echo "     - Format: https://drive.google.com/uc?export=download&id=YOUR_LATEST_JSON_FILE_ID"
