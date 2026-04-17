const addon = require("bindings")("ndi_sender");

class Sender {
  constructor(name) {
    if (typeof name !== "string" || !name.length) {
      throw new Error("Sender name is required");
    }
    this._handle = addon.createSender(name);
    this._name = name;
    this._destroyed = false;
  }

  get name() { return this._name; }

  sendVideo(buffer, width, height, fps) {
    if (this._destroyed) return;
    if (!buffer || !width || !height) return;
    const data = Buffer.isBuffer(buffer)
      ? buffer
      : (buffer instanceof ArrayBuffer ? Buffer.from(buffer) : Buffer.from(buffer.buffer || buffer));
    addon.sendVideo(this._handle, data, width | 0, height | 0, Math.max(1, fps | 0));
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
  isSupported: () => addon.isSupported(),
  version: () => addon.version(),
};
