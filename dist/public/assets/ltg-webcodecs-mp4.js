/*
 * ltg-webcodecs-mp4.js  (Tier C2)
 *
 * Standalone helper that encodes MP4 using the browser's native
 * WebCodecs VideoEncoder + the mp4-muxer library. Avoids ffmpeg
 * entirely for MP4 exports when available.
 *
 * Exposes: `window.ltgWebcodecsMp4` with:
 *   .available()                           → boolean
 *   .encode(frames, opts, onProgress)      → Promise<Uint8Array>
 *
 * `frames` is an array of PNG Uint8Array (same as what vb() produces).
 * `opts` is { width, height, fps, bitrate (optional), alpha (ignored - MP4 has no alpha) }.
 * `onProgress(frameIndex, totalFrames)` fires per-frame.
 *
 * mp4-muxer is fetched from cdn.jsdelivr.net on first call and cached
 * in Cache Storage (same convention as ffmpeg-core) so subsequent calls
 * run 100% offline.
 *
 * If WebCodecs or Cache Storage is unavailable, .available() returns
 * false and the caller should fall back to the ffmpeg path.
 */

(function () {
  "use strict";

  var MUXER_URL = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.0.0/build/mp4-muxer.min.js";
  var CACHE_NAME = "ltg-mp4-muxer-v5.0.0";

  var _muxerPromise = null;

  function available() {
    return typeof window !== "undefined"
      && typeof window.VideoEncoder !== "undefined"
      && typeof window.VideoFrame !== "undefined"
      && typeof window.ImageDecoder !== "undefined"
      && typeof window.caches !== "undefined";
  }

  async function _loadMuxer() {
    if (window.Mp4Muxer && window.Mp4Muxer.Muxer) return window.Mp4Muxer;
    if (_muxerPromise) return _muxerPromise;
    _muxerPromise = (async function () {
      // Try cache first
      var text = null;
      try {
        var cache = await caches.open(CACHE_NAME);
        var hit = await cache.match(MUXER_URL);
        if (hit) text = await hit.text();
      } catch (_) { /* no cache; fall through */ }
      if (!text) {
        var res = await fetch(MUXER_URL);
        if (!res.ok) throw new Error("mp4-muxer fetch failed: " + res.status);
        text = await res.text();
        try {
          var cache2 = await caches.open(CACHE_NAME);
          await cache2.put(MUXER_URL, new Response(text, { headers: { "content-type": "text/javascript" } }));
        } catch (_) { /* cache put optional */ }
      }
      // mp4-muxer 5.x ships as a UMD; running it as a script attaches
      // `Mp4Muxer` to window.
      (function (src) { new Function(src)(); })(text);
      if (!window.Mp4Muxer || !window.Mp4Muxer.Muxer) {
        throw new Error("mp4-muxer loaded but window.Mp4Muxer missing");
      }
      return window.Mp4Muxer;
    })();
    return _muxerPromise;
  }

  async function _decodePng(pngBytes) {
    // Decode PNG → ImageBitmap → usable as VideoFrame source.
    var blob = new Blob([pngBytes], { type: "image/png" });
    return await createImageBitmap(blob);
  }

  async function encode(frames, opts, onProgress) {
    if (!available()) throw new Error("WebCodecs not available");
    var width = opts.width | 0;
    var height = opts.height | 0;
    var fps = opts.fps || 50;
    var bitrate = opts.bitrate || Math.max(2_000_000, width * height * 4);

    var Mp4MuxerMod = await _loadMuxer();
    var muxer = new Mp4MuxerMod.Muxer({
      target: new Mp4MuxerMod.ArrayBufferTarget(),
      video: { codec: "avc", width: width, height: height },
      fastStart: "in-memory",
    });

    var encoderErr = null;
    var encoder = new VideoEncoder({
      output: function (chunk, metadata) { muxer.addVideoChunk(chunk, metadata); },
      error: function (e) { encoderErr = e; },
    });
    encoder.configure({
      codec: "avc1.640028",  // H.264 High @ L4.0 (1080p@50 OK)
      width: width,
      height: height,
      bitrate: bitrate,
      framerate: fps,
    });

    // Use a scratch canvas to decode PNGs into (for cross-browser VideoFrame input).
    var scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    var ctx = scratch.getContext("2d");

    for (var i = 0; i < frames.length; i++) {
      if (encoderErr) throw encoderErr;
      var bmp = await _decodePng(frames[i]);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bmp, 0, 0, width, height);
      bmp.close();
      var frame = new VideoFrame(scratch, { timestamp: Math.round(i * 1_000_000 / fps) });
      encoder.encode(frame, { keyFrame: i === 0 || (i % (fps * 2) === 0) });
      frame.close();
      if (onProgress) { try { onProgress(i + 1, frames.length); } catch (_) {} }
      if (i % 10 === 9) await new Promise(function (r) { setTimeout(r, 0); });
    }

    await encoder.flush();
    encoder.close();
    muxer.finalize();
    var buf = muxer.target.buffer;
    return new Uint8Array(buf);
  }

  window.ltgWebcodecsMp4 = { available: available, encode: encode };
})();
