'use strict';

const crypto = require('node:crypto');

// 与 Go 版本 randomString 使用的字符集保持一致（大小写字母 + 数字）。
const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 生成指定长度的随机字节。 */
function randomBytes(length) {
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`randomBytes: 非法的长度 ${length}`);
  }
  return crypto.randomBytes(length);
}

/** 生成随机字母数字字符串（使用密码学安全随机数）。 */
function randomString(length, charset = ALPHANUMERIC) {
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError(`randomString: 非法的长度 ${length}`);
  }
  if (charset.length === 0) {
    throw new Error('randomString: 字符集不能为空');
  }
  const out = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = charset.charCodeAt(crypto.randomInt(charset.length));
  }
  return out.toString('latin1');
}

/** 生成随机十六进制字符串（小写），长度参数为字节数。 */
function randomHex(byteLength) {
  return randomBytes(byteLength).toString('hex');
}

/** 生成随机十六进制字符串（大写）。 */
function randomHexUpper(byteLength) {
  return randomHex(byteLength).toUpperCase();
}

/** 严格解码十六进制字符串；与 Go 的 hex.DecodeString 行为一致。 */
function hexDecode(value) {
  const s = typeof value === 'string' ? value : String(value);
  if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) {
    throw new Error('encoding/hex: invalid byte');
  }
  return Buffer.from(s, 'hex');
}

/** 编码为十六进制字符串（小写）。 */
function hexEncode(value) {
  return Buffer.from(value).toString('hex');
}

/** 严格解码标准 Base64 字符串。 */
function base64Decode(value) {
  const s = typeof value === 'string' ? value : String(value);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) {
    throw new Error('illegal base64 data');
  }
  return Buffer.from(s, 'base64');
}

/** 解码无填充（Raw）的 Base64 字符串。 */
function base64RawDecode(value) {
  const s = typeof value === 'string' ? value : String(value);
  if (s.includes('=') || s.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(s)) {
    throw new Error('illegal raw base64 data');
  }
  return Buffer.from(s, 'base64');
}

/** 编码为标准 Base64。 */
function base64Encode(value) {
  return Buffer.from(value).toString('base64');
}

/** 计算 MD5 摘要。 */
function md5(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(String(value ?? ''), 'utf8');
  return crypto.createHash('md5').update(input).digest();
}

/** 计算 MD5 摘要并返回小写十六进制。 */
function md5Hex(value) {
  return md5(value).toString('hex');
}

/** PKCS#7 填充。 */
function pkcs7Pad(data, blockSize = 16) {
  const buf = Buffer.from(data);
  const padLen = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

/** PKCS#7 去除填充。 */
function pkcs7Unpad(data, blockSize = 16) {
  const buf = Buffer.from(data);
  if (buf.length === 0 || buf.length % blockSize !== 0) {
    throw new Error('invalid padding');
  }
  const padLen = buf[buf.length - 1];
  if (padLen === 0 || padLen > blockSize || padLen > buf.length) {
    throw new Error('invalid padding size');
  }
  for (let i = buf.length - padLen; i < buf.length; i += 1) {
    if (buf[i] !== padLen) {
      throw new Error('invalid padding content');
    }
  }
  return buf.subarray(0, buf.length - padLen);
}

/** 将任意值转换为 Buffer。 */
function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
}

/** 去除末尾的 0x00 字节。 */
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
