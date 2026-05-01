// decklink_output.mm
//
// N-API addon wrapping the Blackmagic DeckLink SDK so Lower Thirds Generator
// can push BGRA frames out the SDI ports of a connected DeckLink card.
//
// At runtime, DeckLinkAPIDispatch.cpp dlopens
// /Library/Frameworks/DeckLinkAPI.framework. We do not link against the
// framework directly. The DeckLink Duo 2 enumerates as 4 separate IDeckLink
// instances on macOS — one per SDI BNC.
//
// API exposed to JS:
//   addon.enumerate() -> [{ deviceId: string, modelName: string,
//                            displayName: string, supportsOutput: bool }]
//   addon.createSender(deviceId, mode) -> External<SenderHandle>
//   addon.sendFrame(handle, buffer, w, h)
//   addon.destroySender(handle)
//   addon.isSupported() -> bool
//   addon.version() -> string
//
// `mode` is one of: "HD1080p50" (default), "HD1080p5994", "HD1080p2997",
// "HD1080i50", "HD1080i5994", "HD720p50", "HD720p5994". Frame format is
// fixed at bmdFormat8BitBGRA (matches Electron's webContents.capturePage
// output).

#include <napi.h>
#include <CoreFoundation/CoreFoundation.h>
#include <atomic>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "DeckLinkAPI.h"

// ─────────────────────────────────────────────────────────────────────────
// Helpers

namespace {

std::string CFStringToStd(CFStringRef ref) {
  if (!ref) return "";
  CFIndex len = CFStringGetLength(ref);
  CFIndex max = CFStringGetMaximumSizeForEncoding(len, kCFStringEncodingUTF8) + 1;
  std::string out(max, '\0');
  if (CFStringGetCString(ref, out.data(), max, kCFStringEncodingUTF8)) {
    out.resize(std::strlen(out.c_str()));
    return out;
  }
  return "";
}

BMDDisplayMode ParseDisplayMode(const std::string& mode) {
  if (mode == "HD1080p50") return bmdModeHD1080p50;
  if (mode == "HD1080p5994") return bmdModeHD1080p5994;
  if (mode == "HD1080p2997") return bmdModeHD1080p2997;
  if (mode == "HD1080p30") return bmdModeHD1080p30;
  if (mode == "HD1080p25") return bmdModeHD1080p25;
  if (mode == "HD1080p24") return bmdModeHD1080p24;
  if (mode == "HD1080i50") return bmdModeHD1080i50;
  if (mode == "HD1080i5994") return bmdModeHD1080i5994;
  if (mode == "HD720p50") return bmdModeHD720p50;
  if (mode == "HD720p5994") return bmdModeHD720p5994;
  if (mode == "HD720p60") return bmdModeHD720p60;
  return bmdModeHD1080p50;
}

void DisplayModeFrameRate(BMDDisplayMode m, int* num, int* den) {
  *num = 50; *den = 1;
  switch (m) {
    case bmdModeHD1080p24:    *num = 24;     *den = 1;    break;
    case bmdModeHD1080p25:    *num = 25;     *den = 1;    break;
    case bmdModeHD1080p2997:  *num = 30000;  *den = 1001; break;
    case bmdModeHD1080p30:    *num = 30;     *den = 1;    break;
    case bmdModeHD1080p50:    *num = 50;     *den = 1;    break;
    case bmdModeHD1080p5994:  *num = 60000;  *den = 1001; break;
    case bmdModeHD1080i50:    *num = 25;     *den = 1;    break;
    case bmdModeHD1080i5994:  *num = 30000;  *den = 1001; break;
    case bmdModeHD720p50:     *num = 50;     *den = 1;    break;
    case bmdModeHD720p5994:   *num = 60000;  *den = 1001; break;
    case bmdModeHD720p60:     *num = 60;     *den = 1;    break;
    default:                  *num = 50;     *den = 1;    break;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sender handle (one active output per JS Sender instance).

struct SenderHandle {
  IDeckLink* device = nullptr;
  IDeckLinkOutput* output = nullptr;
  IDeckLinkMutableVideoFrame* frame = nullptr;
  BMDDisplayMode mode = bmdModeHD1080p50;
  int width = 1920;
  int height = 1080;
  int frameNum = 50;
  int frameDen = 1;
  bool enabled = false;
  bool destroyed = false;
  std::mutex sendMutex;
};

void DisableAndRelease(SenderHandle* h) {
  if (!h) return;
  if (h->frame) { h->frame->Release(); h->frame = nullptr; }
  if (h->output) {
    if (h->enabled) { h->output->DisableVideoOutput(); }
    h->output->Release();
    h->output = nullptr;
  }
  if (h->device) { h->device->Release(); h->device = nullptr; }
  h->enabled = false;
  h->destroyed = true;
}

void FinalizeSender(Napi::Env env, SenderHandle* h) {
  if (!h) return;
  std::lock_guard<std::mutex> lock(h->sendMutex);
  DisableAndRelease(h);
  delete h;
}

// Locate a device by displayName (used as the JS-visible deviceId). Returns
// AddRef'd IDeckLink* — caller must Release.
IDeckLink* FindDeviceByDisplayName(const std::string& deviceId) {
  IDeckLinkIterator* it = CreateDeckLinkIteratorInstance();
  if (!it) return nullptr;

  IDeckLink* match = nullptr;
  IDeckLink* link = nullptr;
  while (it->Next(&link) == S_OK) {
    CFStringRef name = nullptr;
    if (link->GetDisplayName(&name) == S_OK && name) {
      std::string s = CFStringToStd(name);
      CFRelease(name);
      if (s == deviceId) {
        match = link;  // transfer ownership
        break;
      }
    }
    link->Release();
    link = nullptr;
  }
  it->Release();
  return match;
}

// ─────────────────────────────────────────────────────────────────────────
// JS-visible functions

Napi::Value Enumerate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env);

  IDeckLinkIterator* it = CreateDeckLinkIteratorInstance();
  if (!it) return out;

  uint32_t idx = 0;
  IDeckLink* link = nullptr;
  while (it->Next(&link) == S_OK) {
    CFStringRef modelRef = nullptr;
    CFStringRef displayRef = nullptr;
    link->GetModelName(&modelRef);
    link->GetDisplayName(&displayRef);

    IDeckLinkOutput* outIface = nullptr;
    bool supportsOutput = (link->QueryInterface(IID_IDeckLinkOutput, (void**)&outIface) == S_OK && outIface != nullptr);
    if (outIface) outIface->Release();

    Napi::Object dev = Napi::Object::New(env);
    std::string displayName = CFStringToStd(displayRef);
    std::string modelName = CFStringToStd(modelRef);
    dev.Set("deviceId", Napi::String::New(env, displayName));
    dev.Set("modelName", Napi::String::New(env, modelName));
    dev.Set("displayName", Napi::String::New(env, displayName));
    dev.Set("supportsOutput", Napi::Boolean::New(env, supportsOutput));
    dev.Set("index", Napi::Number::New(env, (double)idx));
    out.Set(idx, dev);

    if (modelRef) CFRelease(modelRef);
    if (displayRef) CFRelease(displayRef);
    link->Release();
    link = nullptr;
    idx++;
  }
  it->Release();
  return out;
}

Napi::Value CreateSender(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "createSender(deviceId: string, mode?: string)").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string deviceId = info[0].As<Napi::String>().Utf8Value();
  std::string modeStr = "HD1080p50";
  if (info.Length() >= 2 && info[1].IsString()) {
    modeStr = info[1].As<Napi::String>().Utf8Value();
  }

  IDeckLink* device = FindDeviceByDisplayName(deviceId);
  if (!device) {
    Napi::Error::New(env, "DeckLink device not found: " + deviceId).ThrowAsJavaScriptException();
    return env.Null();
  }

  IDeckLinkOutput* output = nullptr;
  HRESULT hr = device->QueryInterface(IID_IDeckLinkOutput, (void**)&output);
  if (hr != S_OK || !output) {
    device->Release();
    Napi::Error::New(env, "DeckLink device has no output interface").ThrowAsJavaScriptException();
    return env.Null();
  }

  BMDDisplayMode mode = ParseDisplayMode(modeStr);

  // Verify the output supports the requested mode. Fall back to default if
  // the SDK reports unsupported (otherwise EnableVideoOutput will fail with
  // E_INVALIDARG).
  // Note: DoesSupportVideoMode signature varies across SDK versions; we
  // skip the check and let EnableVideoOutput tell us.

  hr = output->EnableVideoOutput(mode, bmdVideoOutputFlagDefault);
  if (hr != S_OK) {
    output->Release();
    device->Release();
    char err[128];
    std::snprintf(err, sizeof(err), "EnableVideoOutput(%s) failed: HRESULT=0x%08x", modeStr.c_str(), (unsigned)hr);
    Napi::Error::New(env, err).ThrowAsJavaScriptException();
    return env.Null();
  }

  const int kWidth = 1920;
  const int kHeight = 1080;
  const int kRowBytes = kWidth * 4;

  IDeckLinkMutableVideoFrame* frame = nullptr;
  hr = output->CreateVideoFrame(kWidth, kHeight, kRowBytes, bmdFormat8BitBGRA, bmdFrameFlagDefault, &frame);
  if (hr != S_OK || !frame) {
    output->DisableVideoOutput();
    output->Release();
    device->Release();
    Napi::Error::New(env, "CreateVideoFrame failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  SenderHandle* handle = new SenderHandle();
  handle->device = device;
  handle->output = output;
  handle->frame = frame;
  handle->mode = mode;
  handle->width = kWidth;
  handle->height = kHeight;
  handle->enabled = true;
  DisplayModeFrameRate(mode, &handle->frameNum, &handle->frameDen);

  return Napi::External<SenderHandle>::New(env, handle, FinalizeSender);
}

Napi::Value SendFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 4 || !info[0].IsExternal() || !info[1].IsBuffer()) {
    Napi::TypeError::New(env, "sendFrame(handle, buffer, width, height)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  SenderHandle* h = info[0].As<Napi::External<SenderHandle>>().Data();
  if (!h || h->destroyed || !h->enabled || !h->frame || !h->output) return env.Undefined();

  Napi::Buffer<uint8_t> buf = info[1].As<Napi::Buffer<uint8_t>>();
  int w = info[2].As<Napi::Number>().Int32Value();
  int hpx = info[3].As<Napi::Number>().Int32Value();

  if (w != h->width || hpx != h->height) return env.Undefined();
  size_t expected = (size_t)w * (size_t)hpx * 4;
  if (buf.Length() < expected) return env.Undefined();

  std::lock_guard<std::mutex> lock(h->sendMutex);
  if (h->destroyed || !h->frame || !h->output) return env.Undefined();

  void* dst = nullptr;
  if (h->frame->GetBytes(&dst) != S_OK || !dst) return env.Undefined();
  std::memcpy(dst, buf.Data(), expected);

  // Synchronous push — the card pulls frames from its internal buffer at the
  // configured display-mode rate. Faster-than-rate calls effectively drop;
  // slower-than-rate calls cause the last frame to repeat on the SDI output.
  h->output->DisplayVideoFrameSync(h->frame);
  return env.Undefined();
}

Napi::Value DestroySender(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsExternal()) return env.Undefined();
  SenderHandle* h = info[0].As<Napi::External<SenderHandle>>().Data();
  if (!h || h->destroyed) return env.Undefined();
  std::lock_guard<std::mutex> lock(h->sendMutex);
  DisableAndRelease(h);
  return env.Undefined();
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  IDeckLinkIterator* it = CreateDeckLinkIteratorInstance();
  if (!it) return Napi::Boolean::New(env, false);
  it->Release();
  return Napi::Boolean::New(env, true);
}

Napi::Value GetVersion(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  IDeckLinkAPIInformation* api = CreateDeckLinkAPIInformationInstance();
  if (!api) return Napi::String::New(env, "unknown");
  CFStringRef ver = nullptr;
  std::string out = "unknown";
  if (api->GetString(BMDDeckLinkAPIVersion, &ver) == S_OK && ver) {
    out = CFStringToStd(ver);
    CFRelease(ver);
  }
  api->Release();
  return Napi::String::New(env, out);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("enumerate", Napi::Function::New(env, Enumerate));
  exports.Set("createSender", Napi::Function::New(env, CreateSender));
  exports.Set("sendFrame", Napi::Function::New(env, SendFrame));
  exports.Set("destroySender", Napi::Function::New(env, DestroySender));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("version", Napi::Function::New(env, GetVersion));
  return exports;
}

}  // namespace

NODE_API_MODULE(decklink_output, Init)
