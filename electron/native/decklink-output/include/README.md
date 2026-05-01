# DeckLink SDK headers — vendored at build time

This directory is intentionally (mostly) empty in the repository. The
Blackmagic DeckLink SDK is **not redistributable** under a permissive
license — Blackmagic require each developer to accept their license at
their support page before downloading.

The vendor script `build/download-decklink-sdk.sh` populates this folder
from a user-downloaded SDK on the developer's machine.

## One-time setup (developer machine)

1. Visit
   <https://www.blackmagicdesign.com/support/family/capture-and-playback>.
2. Find **Desktop Video SDK** for Mac and click Download.
3. Fill in the name + email form, accept the Blackmagic license.
4. Unzip the archive (typically lands in `~/Downloads/`).
5. Run:

   ```bash
   bash build/download-decklink-sdk.sh
   ```

The script auto-locates an extracted `Blackmagic_DeckLink_SDK_*` folder
under `~/Downloads/`, `~/Desktop/`, `~/Documents/`, or `/Applications/`,
and copies the required headers + `DeckLinkAPIDispatch.cpp` into this
directory. After that, `npm run decklink:build` will succeed.

## Runtime requirement

The DeckLink SDK headers + dispatch file are only needed to **build** the
native addon. At runtime the addon dlopens
`/Library/Frameworks/DeckLinkAPI.framework`, which is installed by the
**Blackmagic Desktop Video** package (free, ships with all DeckLink
hardware). Users running the packaged `.app` only need Desktop Video
installed; they never see the SDK.

## Why isn't this auto-downloaded?

Same reason the NDI SDK isn't auto-downloaded: the SDK ships under a
license that requires explicit acceptance. The `download-decklink-sdk.sh`
script will print the URL and instructions if it can't find the SDK.
