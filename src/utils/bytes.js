"use strict";

const crypto = require("node:crypto");

// Match the character set used by the Go randomString (letters + digits).
const ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate random bytes of the specified length. */
function randomBytes(length) {
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`randomBytes: 非法的长度 ${length}`);
  }
  return crypto.randomBytes(length);
}

/** Generate a random alphanumeric string (cryptographically secure). */
function randomString(length, charset = ALPHANUMERIC) {
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`randomString: 非法的长度 ${length}`);
  }
  if (charset.length === 0) {
    throw new Error("randomString: 字符集不能为空");
  }
  const out = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = charset.charCodeAt(crypto.randomInt(charset.length));
  }
  return out.toString("latin1");
}

/** Generate a random lowercase hex string; the length argument is in bytes. */
function randomHex(byteLength) {
  return randomBytes(byteLength).toString("hex");
}

/** Generate a random uppercase hex string. */
function randomHexUpper(byteLength) {
  return randomHex(byteLength).toUpperCase();
}

/** Strictly decode a hex string; matches Go hex.DecodeString behavior. */
function hexDecode(value) {
  const s = typeof value === "string" ? value : String(value);
  if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) {
    throw new Error("encoding/hex: invalid byte");
  }
  return Buffer.from(s, "hex");
}

/** Encode as a lowercase hex string. */
function hexEncode(value) {
  return Buffer.from(value).toString("hex");
}

/** Strictly decode a standard Base64 string. */
function base64Decode(value) {
  const s = typeof value === "string" ? value : String(value);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) {
    throw new Error("illegal base64 data");
  }
  return Buffer.from(s, "base64");
}

/** Decode an unpadded (Raw) Base64 string. */
function base64RawDecode(value) {
  const s = typeof value === "string" ? value : String(value);
  if (s.includes("=") || s.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(s)) {
    throw new Error("illegal raw base64 data");
  }
  return Buffer.from(s, "base64");
}

/** Encode as standard Base64. */
function base64Encode(value) {
  return Buffer.from(value).toString("base64");
}

/** Compute an MD5 digest. */
function md5(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(String(value ?? ""), "utf8");
  return crypto.createHash("md5").update(input).digest();
}

/** Compute an MD5 digest and return lowercase hex. */
function md5Hex(value) {
  return md5(value).toString("hex");
}

/** PKCS#7 padding. */
function pkcs7Pad(data, blockSize = 16) {
  const buf = Buffer.from(data);
  const padLen = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

/** PKCS#7 unpadding. */
function pkcs7Unpad(data, blockSize = 16) {
  const buf = Buffer.from(data);
  if (buf.length === 0 || buf.length % blockSize !== 0) {
    throw new Error("invalid padding");
  }
  const padLen = buf[buf.length - 1];
  if (padLen === 0 || padLen > blockSize || padLen > buf.length) {
    throw new Error("invalid padding size");
  }
  for (let i = buf.length - padLen; i < buf.length; i += 1) {
    if (buf[i] !== padLen) {
      throw new Error("invalid padding content");
    }
  }
  return buf.subarray(0, buf.length - padLen);
}

/** Convert an arbitrary value to a Buffer. */
function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), "utf8");
}

/** Remove trailing 0x00 bytes. */
function trimTrailingZeros(buf) {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end -= 1;
  return buf.subarray(0, end);
}

module.exports = {
  ALPHANUMERIC,
  randomBytes,
  randomString,
  randomHex,
  randomHexUpper,
  hexDecode,
  hexEncode,
  base64Decode,
  base64RawDecode,
  base64Encode,
  md5,
  md5Hex,
  pkcs7Pad,
  pkcs7Unpad,
  toBuffer,
  trimTrailingZeros,
};
