#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(node -e "console.log(require('${PROJECT_DIR}/package.json').version)")
fi

APP_PATH="${PROJECT_DIR}/dist/mac-arm64/Lower Thirds Generator.app"
DMG_NAME="Lower Thirds Generator-${VERSION}-arm64"
DMG_PATH="${PROJECT_DIR}/dist/${DMG_NAME}.dmg"
VOLUME_NAME="Lower Thirds Generator"
BACKGROUND="${SCRIPT_DIR}/dmg-background.png"
STAGING="${PROJECT_DIR}/.dmg-staging"

if [ ! -d "${APP_PATH}" ]; then
  echo "ERROR: ${APP_PATH} not found."
  echo "Run 'npx electron-builder --mac --publish never' first (it builds the .app even if DMG step fails)."
  exit 1
fi

echo "==> Cleaning previous artifacts..."
rm -f "${DMG_PATH}"
rm -rf "${STAGING}"

echo "==> Creating staging directory..."
mkdir -p "${STAGING}"
cp -a "${APP_PATH}" "${STAGING}/"
ln -s /Applications "${STAGING}/Applications"

echo "==> Creating writable DMG..."
TEMP_DMG="${PROJECT_DIR}/dist/${DMG_NAME}-temp.dmg"
hdiutil create \
  -volname "${VOLUME_NAME}" \
  -srcfolder "${STAGING}" \
  -ov \
  -format UDRW \
  -size 400m \
  "${TEMP_DMG}"

echo "==> Mounting DMG..."
MOUNT_DIR=$(hdiutil attach -readwrite -noverify "${TEMP_DMG}" | grep "/Volumes/" | sed 's/.*\/Volumes/\/Volumes/')

echo "==> Configuring DMG window..."
mkdir -p "${MOUNT_DIR}/.background"
cp "${BACKGROUND}" "${MOUNT_DIR}/.background/background.png"

# Configure icon positions and background via Finder AppleScript.
# This only works in an interactive macOS desktop session.
set +e
osascript <<APPLESCRIPT 2>/dev/null
tell application "Finder"
  tell disk "${VOLUME_NAME}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {100, 100, 640, 480}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 100
    set background picture of theViewOptions to file ".background:background.png"
    set position of item "Lower Thirds Generator.app" of container window to {140, 180}
    set position of item "Applications" of container window to {400, 180}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
APPLESCRIPT
OSASCRIPT_EXIT=$?
set -e
if [ $OSASCRIPT_EXIT -eq 0 ]; then
  echo "    Finder customization applied (background + icon positions)."
else
  echo "    Finder not available — skipping icon positioning (non-fatal)."
  echo "    The DMG still has the app + Applications alias for drag-to-install."
  echo "    Re-run this script from a desktop terminal for full styling."
fi

sync

echo "==> Unmounting..."
hdiutil detach "${MOUNT_DIR}" -quiet

echo "==> Converting to compressed DMG..."
hdiutil convert \
  "${TEMP_DMG}" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "${DMG_PATH}"

rm -f "${TEMP_DMG}"
rm -rf "${STAGING}"

echo ""
echo "==> DMG created successfully!"
echo "    ${DMG_PATH}"
echo "    Size: $(du -h "${DMG_PATH}" | awk '{print $1}')"
