const addon = require("bindings")("decklink_output");

// Mirrors the JS shape of electron/native/ndi-sender/index.js:
// the addon hands back an External<SenderHandle> which we hold in
// `_handle`; lifetime + thread-safety live on the C++ side.
class Sender {
  constructor(deviceId, mode) {
    if (typeof deviceId !== "string" || !deviceId.length) {
      throw new Error("Sender deviceId is required");
    }
    this._handle = addon.createSender(deviceId, mode || "HD1080p50");
    this._deviceId = deviceId;
    this._mode = mode || "HD1080p50";
    this._destroyed = false;
  }

  get deviceId() { return this._deviceId; }
  get mode() { return this._mode; }

  sendFrame(buffer, width, height) {
    if (this._destroyed) return;
    if (!buffer || !width || !height) return;
    const data = Buffer.isBuffer(buffer)
      ? buffer
      : (buffer instanceof ArrayBuffer ? Buffer.from(buffer) : Buffer.from(buffer.buffer || buffer));
    addon.sendFrame(this._handle, data, width | 0, height | 0);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    try { addon.destroySender(this._handle); } catch (_e) { /* ignore */ }
    this._handle = null;
  }
}

module.exports = {
  Sender,
  enumerate: () => addon.enumerate(),
  isSupported: () => addon.isSupported(),
  version: () => addon.version(),
};
