# DeckLink — hand-rolled minimal interface

This folder contains a self-contained, hand-written subset of the Blackmagic
DeckLink ABI:

- `DeckLinkAPI.h` — re-declares the five interfaces and ~eleven methods the
  app actually calls (enumerate devices, open an output, push BGRA frames at
  1080p50). Everything else is omitted.
- `DeckLinkAPIDispatch.cpp` — `dlopen`s
  `/Library/Frameworks/DeckLinkAPI.framework` at runtime via `CFBundle` and
  resolves `CreateDeckLinkIteratorInstance_0004` /
  `CreateDeckLinkAPIInformationInstance_0001`. No compile-time link
  dependency on the framework.

We do **not** ship or require the official Blackmagic SDK. New checkouts
build with just `npm run decklink:build` — no license-gated download step.

## Runtime requirement

The user's Mac must have **Blackmagic Desktop Video** installed (free
download from blackmagicdesign.com/support). That ships
`/Library/Frameworks/DeckLinkAPI.framework`, which is what physically drives
the DeckLink card. If the framework is absent, the dispatch loader returns
`nullptr` and the app reports the DeckLink module as unavailable; the rest
of the app keeps working unchanged.

## ABI-stability bet

We rely on Blackmagic keeping their COM-style vtables append-only across
Desktop Video releases — i.e., they never reorder existing methods, only
add new ones at the end. That has been their published policy and observed
behaviour since SDK 11 (2018).

If a future release breaks this, the addon segfaults at startup and the
fix is to:

1. Read the latest "DeckLink SDK Manual" PDF for the changed interface.
2. Update the slot order / count in `DeckLinkAPI.h`.
3. Recompile.

The static asserts in `src/decklink_output.mm` and the slot-index
comments in `DeckLinkAPI.h` exist precisely to make this audit trivial
when it eventually happens.

## Files committed here

| File                    | Origin                              | License        |
| ----------------------- | ----------------------------------- | -------------- |
| `DeckLinkAPI.h`         | This project (hand-written)         | MIT (this repo) |
| `DeckLinkAPIDispatch.cpp` | This project (hand-written)       | MIT (this repo) |
| `README.md`             | This project                        | MIT (this repo) |
