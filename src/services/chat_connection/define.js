"use strict";

/**
 * Chat connection protocol definitions (mirrors Go service/chat_connection/define.go).
 */

const HANDSHAKE_REQUEST_CMD = 0x0101; // 257
const HEARTBEAT_INTERVAL_MS = 10 * 1000;

const emptyFrame = Buffer.from([0x00, 0x00]);

/** Build a length prefix (2 bytes, little-endian). */
function frameLengthPrefix(length) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(length & 0xffff, 0);
  return buf;
}

/** Add a 2-byte little-endian length prefix to a payload. */
function wrapFrame(payload) {
  const buf = Buffer.from(payload);
  if (buf.length > 0xffff) {
    throw new Error(`chat_connection: payload 过长: ${buf.length}`);
  }
  return Buffer.concat([frameLengthPrefix(buf.length), buf]);
}

/**
 * Frame reader based on the socket data stream.
 * Zero-length frames are returned as empty Buffers.
 */
class FrameReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.frames = [];
    this.waiters = [];
    this.closed = false;
    this.error = null;

    this._onData = (chunk) => this._pushData(chunk);
    this._onClose = () => this._close();
    this._onError = (err) => {
      this.error = err;
      this._close();
    };

    socket.on("data", this._onData);
    socket.on("end", this._onClose);
    socket.on("close", this._onClose);
    socket.on("error", this._onError);
  }

  _pushData(chunk) {
    if (this.closed) return;
    this.buffer = this.buffer.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([this.buffer, chunk]);

    for (;;) {
      if (this.buffer.length < 2) return;
      const size = this.buffer.readUInt16LE(0);
      if (size === 0) {
        this.buffer = this.buffer.subarray(2);
        this._deliver(Buffer.alloc(0));
        continue;
      }
      if (this.buffer.length < 2 + size) return;
      const frame = Buffer.from(this.buffer.subarray(2, 2 + size));
      this.buffer = this.buffer.subarray(2 + size);
      this._deliver(frame);
    }
  }

  _deliver(frame) {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(frame);
    } else {
      this.frames.push(frame);
    }
  }

  _close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      if (this.error) waiter.reject(this.error);
      else waiter.resolve(null);
    }
  }

  /** Read the next frame; returns null when the connection closes normally. */
  readFrame() {
    if (this.frames.length > 0) {
      return Promise.resolve(this.frames.shift());
    }
    if (this.closed) {
      return this.error ? Promise.reject(this.error) : Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Actively destroy the reader (does not close the socket). */
  destroy() {
    this.socket.removeListener("data", this._onData);
    this.socket.removeListener("end", this._onClose);
    this.socket.removeListener("close", this._onClose);
    // Keep the error listener to avoid an unhandled 'error' event after the socket is destroyed.
    this._close();
  }
}

module.exports = {
  HANDSHAKE_REQUEST_CMD,
  HEARTBEAT_INTERVAL_MS,
  emptyFrame,
  frameLengthPrefix,
  wrapFrame,
  FrameReader,
};
