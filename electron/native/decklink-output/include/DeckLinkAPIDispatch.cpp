// DeckLinkAPIDispatch.cpp — runtime loader for /Library/Frameworks/DeckLinkAPI.framework
//
// We don't link against DeckLinkAPI.framework at compile time. Instead, on
// first call to CreateDeckLinkIteratorInstance() / CreateDeckLinkAPIInformationInstance()
// we CFBundle-load the framework and resolve the two ABI-versioned C entry
// points exported by it:
//
//   _CreateDeckLinkIteratorInstance_0004
//   _CreateDeckLinkAPIInformationInstance_0001
//
// These suffixes are the symbol names Blackmagic ships in Desktop Video and
// have been stable across SDK 11 through SDK 14. If the framework is not
// installed (or fails to load), both entry points return nullptr and
// decklinkOutput.cjs reports the addon as unavailable so the UI hides
// DeckLink rows from its dropdowns.
//
// The ABI of these functions is:
//
//   IDeckLinkIterator*       CreateDeckLinkIteratorInstance_0004(void);
//   IDeckLinkAPIInformation* CreateDeckLinkAPIInformationInstance_0001(void);
//
// — same calling convention/return type as the SDK-provided dispatch.cpp.
// They each return an AddRef'd object the caller is responsible for
// Release()-ing.
//
// dispatch_once guarantees we resolve the framework + symbols at most once
// per process; subsequent calls are a thread-safe pointer load.

#include "DeckLinkAPI.h"

#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>

namespace {

typedef IDeckLinkIterator*       (*PFN_CreateIterator)(void);
typedef IDeckLinkAPIInformation* (*PFN_CreateAPIInfo)(void);

PFN_CreateIterator g_createIterator = nullptr;
PFN_CreateAPIInfo  g_createAPIInfo  = nullptr;

dispatch_once_t g_loadOnce;

void LoadFramework() {
  // Locate the framework on disk. Standard install path; falling back to
  // the bundle URL form so we get the dynamic library inside.
  CFURLRef url = CFURLCreateWithFileSystemPath(
      kCFAllocatorDefault,
      CFSTR("/Library/Frameworks/DeckLinkAPI.framework"),
      kCFURLPOSIXPathStyle,
      true);
  if (!url) return;

  CFBundleRef bundle = CFBundleCreate(kCFAllocatorDefault, url);
  CFRelease(url);
  if (!bundle) return;

  // CFBundleLoadExecutable returns false if the framework is already loaded
  // OR if it loads it for the first time successfully — either is fine for
  // us. We just need the symbols resolvable below.
  if (!CFBundleIsExecutableLoaded(bundle)) {
    CFBundleLoadExecutable(bundle);
  }

  CFStringRef iterName =
      CFSTR("CreateDeckLinkIteratorInstance_0004");
  CFStringRef apiName =
      CFSTR("CreateDeckLinkAPIInformationInstance_0001");

  g_createIterator = reinterpret_cast<PFN_CreateIterator>(
      CFBundleGetFunctionPointerForName(bundle, iterName));
  g_createAPIInfo = reinterpret_cast<PFN_CreateAPIInfo>(
      CFBundleGetFunctionPointerForName(bundle, apiName));

  // We deliberately leak the bundle reference. Unloading the framework
  // would invalidate every IDeckLink* the caller is currently holding,
  // and we have no way to reference-count those across the C ABI.
}

}  // namespace

// ─── IID definitions ──────────────────────────────────────────────────────
//
// Byte values verified by hex search of the installed framework binary on
// macOS (Desktop Video 12.x). Same UUID has shipped continuously since
// SDK 11; the chance of it being remapped is effectively zero — Blackmagic
// would have to break every existing customer. Documented in DeckLinkAPI.h.

const REFIID IID_IDeckLinkOutput = {
    0xCC, 0x5C, 0x8A, 0x6E,
    0x3F, 0x2F,
    0x4B, 0x3A,
    0x87, 0xEA,
    0xFD, 0x78, 0xAF, 0x30, 0x05, 0x64,
};

// ─── Factory entry points ─────────────────────────────────────────────────

extern "C" IDeckLinkIterator* CreateDeckLinkIteratorInstance(void) {
  dispatch_once(&g_loadOnce, ^{ LoadFramework(); });
  if (!g_createIterator) return nullptr;
  return g_createIterator();
}

extern "C" IDeckLinkAPIInformation* CreateDeckLinkAPIInformationInstance(void) {
  dispatch_once(&g_loadOnce, ^{ LoadFramework(); });
  if (!g_createAPIInfo) return nullptr;
  return g_createAPIInfo();
}
