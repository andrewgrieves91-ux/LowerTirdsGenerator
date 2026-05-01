// DeckLinkAPI.h — hand-rolled minimal interface to /Library/Frameworks/DeckLinkAPI.framework
//
// This header is NOT the official Blackmagic SDK header. It is a from-scratch
// re-declaration of the small subset of the DeckLink runtime ABI that the
// lower-thirds Electron app actually calls (enumeration + 1080p50 BGRA video
// output). The shipping app dlopens DeckLinkAPI.framework at runtime via
// DeckLinkAPIDispatch.cpp, so no compile-time dependency on the SDK exists
// and a fresh clone builds without anyone first downloading a license-gated
// archive.
//
// ─── ABI-stability bet ───────────────────────────────────────────────────
//
// Blackmagic ships their interfaces as COM-style virtual classes with stable
// vtable layouts. Their published compatibility policy is to ADD new methods
// only at the END of existing vtables and, when a binary-incompatible change
// is required, to mint a new IID/interface (e.g., IDeckLink_v8_2 vs IDeckLink).
// Concretely this means: as long as we keep the order and count of declared
// virtual methods up to the slot of the LAST method we call, the vtable
// indices the C++ compiler emits for our calls will line up with the
// framework's actual implementation.
//
// What the runtime gives us when we call CreateDeckLinkIteratorInstance() and
// IDeckLinkIterator::Next() is the MODERN simplified IDeckLink interface
// (SDK 11 / 2018 onwards): just GetModelName + GetDisplayName, no legacy
// GetCategory_v8_2 / GetVendorName_v8_2 cruft. Likewise IDeckLinkOutput is
// the SDK 11+ vtable up to DisplayVideoFrameSync (slot 12); slots 13+ are
// scheduled-playback / audio / reference-clock methods we don't touch.
//
// If a future Desktop Video release breaks this assumption (reorders or
// removes a method we use), this addon will segfault on first call. The fix
// is to:
//   1. Read the latest "Blackmagic DeckLink SDK Manual" PDF for the
//      affected interface's vtable order.
//   2. Adjust the placeholder slot count / signatures in this file to match.
//   3. Recompile. No userspace changes required.
//
// ─── Coverage ────────────────────────────────────────────────────────────
//
// Five interfaces, eleven methods. Everything else is declared as
// `slotN_unused()` placeholders that occupy the right vtable slot but would
// crash if anyone ever called them — intentional, so a future maintainer
// who tries to call (say) ScheduleVideoFrame finds out at link time that
// this header doesn't expose it.
//
// Interface         | Methods we call (slot)
// ─────────────────|─────────────────────────────────────────────────────
// IUnknown_LT      | QueryInterface(0), AddRef(1), Release(2)
// IDeckLinkIterator| Next(3)
// IDeckLink        | GetModelName(3), GetDisplayName(4)
// IDeckLinkOutput  | EnableVideoOutput(7), DisableVideoOutput(8),
//                  | CreateVideoFrame(10), DisplayVideoFrameSync(12)
// IDeckLinkVideoFrame      | GetBytes(8)
// IDeckLinkAPIInformation  | GetString(6)
//
// IID_IDeckLinkOutput is the only IID we need (used in QueryInterface). Its
// 16-byte value `CC5C8A6E-3F2F-4B3A-87EA-FD78AF300564` is confirmed present
// in the framework binary across SDK 11 through SDK 14. The factory
// functions Create*Instance() return their respective top-level interfaces
// directly, so no other IIDs are referenced.

#pragma once

#include <CoreFoundation/CoreFoundation.h>
#include <stdint.h>

// ─── COM-style scalars ────────────────────────────────────────────────────

typedef int32_t        HRESULT;
typedef CFUUIDBytes    REFIID;
typedef uint32_t       ULONG;
typedef bool           BOOL;

#ifndef S_OK
#define S_OK           ((HRESULT)0x00000000)
#endif
#ifndef S_FALSE
#define S_FALSE        ((HRESULT)0x00000001)
#endif
#ifndef E_FAIL
#define E_FAIL         ((HRESULT)0x80004005)
#endif
#ifndef E_NOINTERFACE
#define E_NOINTERFACE  ((HRESULT)0x80000004)
#endif
#ifndef E_INVALIDARG
#define E_INVALIDARG   ((HRESULT)0x80070057)
#endif
#ifndef E_OUTOFMEMORY
#define E_OUTOFMEMORY  ((HRESULT)0x8007000E)
#endif

// ─── FourCC enums ─────────────────────────────────────────────────────────
//
// FourCC literals match the SDK manual exactly. Endian note: FourCCs in
// Blackmagic's headers are written as multi-character constants ('Hp50'),
// which on Apple Clang produce the host-order uint32_t the framework
// expects on macOS. Don't reformat these as 0x... hex — keep them as
// character literals so they read like the SDK manual.

typedef uint32_t BMDDisplayMode;
enum {
  bmdModeUnknown        = 0,
  bmdModeNTSC           = 'ntsc',
  bmdModeHD1080p2398    = '23ps',
  bmdModeHD1080p24      = '24ps',
  bmdModeHD1080p25      = 'Hp25',
  bmdModeHD1080p2997    = 'Hp29',
  bmdModeHD1080p30      = 'Hp30',
  bmdModeHD1080p50      = 'Hp50',
  bmdModeHD1080p5994    = 'Hp59',
  bmdModeHD1080p6000    = 'Hp60',
  bmdModeHD1080i50      = 'Hi50',
  bmdModeHD1080i5994    = 'Hi59',
  bmdModeHD1080i6000    = 'Hi60',
  bmdModeHD720p50       = 'hp50',
  bmdModeHD720p5994     = 'hp59',
  bmdModeHD720p60       = 'hp60',
};

typedef uint32_t BMDPixelFormat;
enum {
  bmdFormat8BitYUV      = '2vuy',
  bmdFormat10BitYUV     = 'v210',
  bmdFormat8BitARGB     = 32,        // sentinel non-FourCC, per SDK
  bmdFormat8BitBGRA     = 'BGRA',
  bmdFormat10BitRGB     = 'r210',
};

typedef uint32_t BMDVideoOutputFlags;
enum {
  bmdVideoOutputFlagDefault       = 0,
  bmdVideoOutputVANC              = 1u << 0,
  bmdVideoOutputVITC              = 1u << 1,
  bmdVideoOutputRP188             = 1u << 2,
  bmdVideoOutputDualStream3D      = 1u << 4,
};

typedef uint32_t BMDFrameFlags;
enum {
  bmdFrameFlagDefault             = 0,
  bmdFrameFlagFlipVertical        = 1u << 0,
};

typedef uint32_t BMDDeckLinkAPIInformationID;
enum {
  BMDDeckLinkAPIVersion           = 'vers',
};

// ─── Forward decls ────────────────────────────────────────────────────────

class IDeckLink;
class IDeckLinkIterator;
class IDeckLinkOutput;
class IDeckLinkVideoFrame;
class IDeckLinkMutableVideoFrame;
class IDeckLinkAPIInformation;

// ─── IUnknown ─────────────────────────────────────────────────────────────
//
// Renamed to IUnknown_LT to avoid clashing with Windows' IUnknown if anyone
// ever cross-compiles. macOS-only build, so the rename is purely defensive.

class IUnknown_LT {
 public:
  // Slot 0
  virtual HRESULT QueryInterface(REFIID iid, void** ppv) = 0;
  // Slot 1
  virtual ULONG   AddRef() = 0;
  // Slot 2
  virtual ULONG   Release() = 0;
};

// ─── IDeckLink (SDK 11+ minimal) ──────────────────────────────────────────

class IDeckLink : public IUnknown_LT {
 public:
  // Slot 3
  virtual HRESULT GetModelName(CFStringRef* modelName) = 0;
  // Slot 4
  virtual HRESULT GetDisplayName(CFStringRef* displayName) = 0;
};

// ─── IDeckLinkIterator ────────────────────────────────────────────────────

class IDeckLinkIterator : public IUnknown_LT {
 public:
  // Slot 3
  virtual HRESULT Next(IDeckLink** deckLinkInstance) = 0;
};

// ─── IDeckLinkOutput ──────────────────────────────────────────────────────
//
// Vtable layout up to slot 12 (DisplayVideoFrameSync). Slots 3-6, 9, 11 are
// methods we don't call; they are declared as no-arg `slotN_unused()` so
// they take exactly one vtable slot each and a stray future call would
// trip a compiler error rather than silently dispatching to the wrong
// method. Don't change these placeholders to take args without a
// corresponding vtable-order audit.

class IDeckLinkOutput : public IUnknown_LT {
 public:
  // Slot 3 — DoesSupportVideoMode (signature differs across SDK versions)
  virtual HRESULT slot3_DoesSupportVideoMode_unused() = 0;
  // Slot 4 — GetDisplayMode
  virtual HRESULT slot4_GetDisplayMode_unused() = 0;
  // Slot 5 — GetDisplayModeIterator
  virtual HRESULT slot5_GetDisplayModeIterator_unused() = 0;
  // Slot 6 — SetScreenPreviewCallback
  virtual HRESULT slot6_SetScreenPreviewCallback_unused() = 0;
  // Slot 7
  virtual HRESULT EnableVideoOutput(BMDDisplayMode displayMode,
                                    BMDVideoOutputFlags flags) = 0;
  // Slot 8
  virtual HRESULT DisableVideoOutput() = 0;
  // Slot 9 — SetVideoOutputFrameMemoryAllocator
  virtual HRESULT slot9_SetVideoOutputFrameMemoryAllocator_unused() = 0;
  // Slot 10
  virtual HRESULT CreateVideoFrame(int32_t width, int32_t height,
                                   int32_t rowBytes,
                                   BMDPixelFormat pixelFormat,
                                   BMDFrameFlags flags,
                                   IDeckLinkMutableVideoFrame** outFrame) = 0;
  // Slot 11 — CreateAncillaryData (legacy)
  virtual HRESULT slot11_CreateAncillaryData_unused() = 0;
  // Slot 12
  virtual HRESULT DisplayVideoFrameSync(IDeckLinkVideoFrame* theFrame) = 0;
};

// ─── IDeckLinkVideoFrame ──────────────────────────────────────────────────
//
// SDK has GetWidth..GetFlags returning `long` before GetBytes. Declared as
// placeholders (we never need the dimensions on the C++ side, we already
// know them from CreateVideoFrame).

class IDeckLinkVideoFrame : public IUnknown_LT {
 public:
  // Slot 3 — GetWidth
  virtual long slot3_GetWidth_unused() = 0;
  // Slot 4 — GetHeight
  virtual long slot4_GetHeight_unused() = 0;
  // Slot 5 — GetRowBytes
  virtual long slot5_GetRowBytes_unused() = 0;
  // Slot 6 — GetPixelFormat
  virtual BMDPixelFormat slot6_GetPixelFormat_unused() = 0;
  // Slot 7 — GetFlags
  virtual BMDFrameFlags slot7_GetFlags_unused() = 0;
  // Slot 8
  virtual HRESULT GetBytes(void** buffer) = 0;
};

// IDeckLinkMutableVideoFrame extends IDeckLinkVideoFrame with several
// mutator methods (SetFlags, SetTimecode, ...). We only ever obtain one
// from IDeckLinkOutput::CreateVideoFrame and pass it back into
// DisplayVideoFrameSync, so we never need its mutator methods. An empty
// derived class keeps the type-safety; the runtime returns the same
// pointer either way.
class IDeckLinkMutableVideoFrame : public IDeckLinkVideoFrame {};

// ─── IDeckLinkAPIInformation ──────────────────────────────────────────────

class IDeckLinkAPIInformation : public IUnknown_LT {
 public:
  // Slot 3 — GetFlag
  virtual HRESULT slot3_GetFlag_unused() = 0;
  // Slot 4 — GetInt
  virtual HRESULT slot4_GetInt_unused() = 0;
  // Slot 5 — GetFloat
  virtual HRESULT slot5_GetFloat_unused() = 0;
  // Slot 6
  virtual HRESULT GetString(BMDDeckLinkAPIInformationID cfgID,
                            CFStringRef* value) = 0;
};

// ─── IIDs ─────────────────────────────────────────────────────────────────
//
// Only IID_IDeckLinkOutput is needed — used by QueryInterface to widen an
// IDeckLink* into an IDeckLinkOutput*. Verified by direct byte-search
// against /Library/Frameworks/DeckLinkAPI.framework/DeckLinkAPI on the
// build machine.

extern const REFIID IID_IDeckLinkOutput;

// ─── Factory functions (implemented in DeckLinkAPIDispatch.cpp) ───────────

extern "C" {

IDeckLinkIterator*       CreateDeckLinkIteratorInstance(void);
IDeckLinkAPIInformation* CreateDeckLinkAPIInformationInstance(void);

}  // extern "C"
