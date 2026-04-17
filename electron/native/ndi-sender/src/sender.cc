// Minimal NDI sender addon for Lower Thirds Generator.
// Exposes: createSender(name), sendVideo(handle, buf, w, h, fps), destroySender(handle), isSupported(), version()

#include <napi.h>
#include <atomic>
#include <mutex>
#include <string>
#include "Processing.NDI.Lib.h"

namespace {

std::atomic<int> g_initCount{0};
std::mutex g_initMutex;

bool ensureNdiInit() {
  std::lock_guard<std::mutex> lock(g_initMutex);
  if (g_initCount.load() == 0) {
    if (!NDIlib_initialize()) return false;
  }
  g_initCount++;
  return true;
}

void releaseNdi() {
  std::lock_guard<std::mutex> lock(g_initMutex);
  int c = g_initCount.fetch_sub(1);
  if (c <= 1) {
    NDIlib_destroy();
    g_initCount.store(0);
  }
}

// Wraps an NDIlib_send_instance_t so JS can hold it as an External.
struct SenderHandle {
  NDIlib_send_instance_t instance = nullptr;
  std::string name;
  bool destroyed = false;
};

void FinalizeSender(Napi::Env env, SenderHandle* h) {
  if (!h) return;
  if (!h->destroyed && h->instance) {
    NDIlib_send_destroy(h->instance);
    h->instance = nullptr;
    h->destroyed = true;
    releaseNdi();
  }
  delete h;
}

Napi::Value CreateSender(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "createSender(name: string) expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!ensureNdiInit()) {
    Napi::Error::New(env, "NDIlib_initialize failed (CPU may not be supported)").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();

  NDIlib_send_create_t desc = {};
  desc.p_ndi_name = name.c_str();
  desc.p_groups = nullptr;
  desc.clock_video = false;
  desc.clock_audio = false;

  NDIlib_send_instance_t instance = NDIlib_send_create(&desc);
  if (!instance) {
    releaseNdi();
    Napi::Error::New(env, "NDIlib_send_create returned null").ThrowAsJavaScriptException();
    return env.Null();
  }

  SenderHandle* handle = new SenderHandle();
  handle->instance = instance;
  handle->name = name;
  return Napi::External<SenderHandle>::New(env, handle, FinalizeSender);
}

Napi::Value DestroySender(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsExternal()) {
    Napi::TypeError::New(env, "destroySender(handle) expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  SenderHandle* h = info[0].As<Napi::External<SenderHandle>>().Data();
  if (!h || h->destroyed) return env.Undefined();
  NDIlib_send_destroy(h->instance);
  h->instance = nullptr;
  h->destroyed = true;
  releaseNdi();
  return env.Undefined();
}

Napi::Value SendVideo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 5 || !info[0].IsExternal() || !info[1].IsBuffer()) {
    Napi::TypeError::New(env, "sendVideo(handle, buffer, width, height, fps) expected").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  SenderHandle* h = info[0].As<Napi::External<SenderHandle>>().Data();
  if (!h || h->destroyed || !h->instance) return env.Undefined();

  Napi::Buffer<uint8_t> buf = info[1].As<Napi::Buffer<uint8_t>>();
  int w = info[2].As<Napi::Number>().Int32Value();
  int h_px = info[3].As<Napi::Number>().Int32Value();
  int fps = info[4].As<Napi::Number>().Int32Value();

  if (w <= 0 || h_px <= 0) return env.Undefined();
  size_t expected = (size_t)w * (size_t)h_px * 4;
  if (buf.Length() < expected) {
    Napi::Error::New(env, "buffer too small for RGBA frame").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  NDIlib_video_frame_v2_t frame = {};
  frame.xres = w;
  frame.yres = h_px;
  frame.FourCC = NDIlib_FourCC_video_type_BGRA;
  frame.frame_rate_N = fps > 0 ? fps * 1000 : 60000;
  frame.frame_rate_D = 1000;
  frame.picture_aspect_ratio = (float)w / (float)h_px;
  frame.frame_format_type = NDIlib_frame_format_type_progressive;
  frame.timecode = NDIlib_send_timecode_synthesize;
  frame.p_data = buf.Data();
  frame.line_stride_in_bytes = w * 4;
  frame.p_metadata = nullptr;
  frame.timestamp = NDIlib_recv_timestamp_undefined;

  NDIlib_send_send_video_v2(h->instance, &frame);
  return env.Undefined();
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool ok = NDIlib_is_supported_CPU();
  return Napi::Boolean::New(env, ok);
}

Napi::Value GetVersion(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const char* v = NDIlib_version();
  return Napi::String::New(env, v ? v : "unknown");
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("createSender", Napi::Function::New(env, CreateSender));
  exports.Set("destroySender", Napi::Function::New(env, DestroySender));
  exports.Set("sendVideo", Napi::Function::New(env, SendVideo));
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("version", Napi::Function::New(env, GetVersion));
  return exports;
}

} // namespace

NODE_API_MODULE(ndi_sender, Init)
