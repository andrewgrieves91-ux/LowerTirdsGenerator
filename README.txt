LOWER THIRDS GENERATOR — OFFLINE VERSION
=========================================

REQUIREMENTS
------------
- Node.js 18 or later  →  https://nodejs.org  (free download)
- No internet connection required after first run

FIRST RUN (installs express — takes ~5 seconds)
-------------------------------------------------
macOS:   Double-click  "Launch Lower Thirds.command"
         If macOS blocks it: right-click → Open → Open

Windows: Double-click  "Launch Lower Thirds.bat"

The launcher will:
  1. Check Node.js is installed
  2. Install the one required package (express) on first run only
  3. Start the local server on http://localhost:3000
  4. Open your browser automatically

SUBSEQUENT RUNS
---------------
Same as above — the dependency install step is skipped automatically.

STOPPING THE APP
----------------
Close the Terminal / Command Prompt window that opened.

TROUBLESHOOTING
---------------
• Browser shows "Cannot connect" — wait 2 seconds and refresh.
  The server may still be starting.

• macOS: "cannot be opened because it is from an unidentified developer"
  → Right-click the .command file → Open → click Open in the dialog.

• Port conflict: If port 3000 is in use, the Mac launcher automatically
  picks the next available port (3001, 3002, …). The Windows launcher
  always uses 3000 — close any other app using that port first.

• Node.js not found on Mac even though it's installed:
  Node.js installed via nvm may not be in the PATH used by .command files.
  Open Terminal and run:
    cd "/path/to/this/folder"
    node dist/index.js
  Then open http://localhost:3000 in your browser.

FEATURES
--------
- Full Lower Thirds Generator — identical to the online version
- Cues are saved in your browser's localStorage
- Pop-out windows (Feed 1 / Filter 1) work the same as online
- Companion HTTP API available at http://localhost:3000/api/companion
- Export page (video rendering) works fully offline
- No login required

