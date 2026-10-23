"use strict";

/**
 * Utility functions from Go utils/encryption.go and utils/aes.go.
 * These are mainly used by MPay login, PE auth signing, and legacy HTTP encryption.
 */

const {
  randomBytes,
  randomString,
  hexDecode,
  hexEncode,
  base64Encode,
  md5,
  md5Hex,
} = require("./bytes.js");
const { aesCbcEncrypt, aesCbcDecrypt } = require("./aes.js");

/** MD5-hash the login token and return a 16-byte digest. */
function getEncryptedToken(loginToken) {
  return md5(loginToken);
}

/**
 * G79 dynamic HTTP token (utils version).
 * Equivalent to CalculateDynamicToken in the root crypto.go, just organized differently.
 */
function g79GetDynamicHttpToken(loginToken, path, body) {
  const loginTokenHash = md5Hex(loginToken);
  const string2 = md5Hex(loginTokenHash + body + "0eGsBkhl" + path);

  const bin = Buffer.alloc(string2.length * 8);
  for (let i = 0; i < string2.length; i += 1) {
    const v = string2.charCodeAt(i);
    for (let j = 0; j < 8; j += 1) {
      bin[i * 8 + j] = (v >> (7 - j)) & 1;
    }
  }
  // Left shift by 6 bits
  const shifted = Buffer.concat([bin.subarray(6), bin.subarray(0, 6)]);
  const shiftedBytes = Buffer.alloc(shifted.length / 8);
  for (let i = 0; i < shiftedBytes.length; i += 1) {
    let v = 0;
    for (let j = 0; j < 8; j += 1) {
      v = (v << 1) | shifted[i * 8 + j];
    }
    shiftedBytes[i] = v;
  }

  const raw = Buffer.from(string2, "latin1");
  const xored = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    xored[i] = raw[i] ^ shiftedBytes[i];
  }
  return encryptToken(base64Encode(xored));
}

function encryptToken(s) {
  const replaced = String(s).replace(/\+/g, "m").replace(/\//g, "o");
  const prefix = replaced.length >= 16 ? replaced.slice(0, 16) : replaced;
  return `${prefix}1`;
}

const G79_KEY_TABLE = [
  "1C8D9CAD811F2F1E3F7B3B5D208DBE83",
  "96271EAE017F444B342EB8C53AE106BA",
  "6B5FF1292C60237E776923CF4C49ED9A",
  "F020969C883F9C7ADC2C5A130FD1A9CC",
  "607EB25E875E8C9B5C1C5D08648F2D8F",
  "E67D0B4397CCB39C97A78F03315FBE03",
  "3F8F5F7CC35950BF5C9E2B56B20A1F1B",
  "7B8D1D7D674D7D8D917F7D0F2A4D9B48",
  "78289B0C06234B2A2A7D9D7C3C1C1CD3",
  "180928C6AF6C703FBD1A1C8C7EB06C8F",
  "9D2B5D4D0C843E445C4E2A3E19CCCC3F",
  "ED33B9EF6DCC3D2D45428AF516F80A4A",
  "7B6CBC5C215E3E4B7E2F5F5A206823DD",
  "7932137D6A2E1B7E204D6D891ED55D95",
  "0E516BF59BEE9EB6712F5E5D63AC89D2",
  "ED8BBB2D808A0D8F353F3F7B0E486BE5",
];

/** Select a key by index, hex-decode it, then XOR each byte with 0x7C. */
function g79PickKey(index) {
  if (!Number.isInteger(index) || index < 0 || index >= G79_KEY_TABLE.length) {
    throw new Error(`G79PickKey: index ${index} out of range (0-${G79_KEY_TABLE.length - 1})`);
  }
  const key = hexDecode(G79_KEY_TABLE[index]);
  for (let i = 0; i < key.length; i += 1) {
    key[i] ^= 0x7c;
  }
  return key;
}

/** utils version of G79 HTTP encryption (returns a hex string). */
function g79UtilsHttpEncrypt(data) {
  const dataBytes = Buffer.from(String(data), "utf8");
  const tail = Buffer.from(randomString(16), "latin1");
  const padded = Buffer.concat([dataBytes, tail]);
  const paddedLen = padded.length + ((16 - (padded.length % 16)) % 16);

  const version = 0x04;
  const index = randomBytes(1)[0] & 0x0f;
  const iv = randomBytes(16);
  const key = g79PickKey(index);

  const buffer = Buffer.alloc(paddedLen);
  padded.copy(buffer);
  const encrypted = aesCbcEncrypt(buffer, key, iv);

  const result = Buffer.concat([iv, encrypted, Buffer.from([((index << 4) | version) & 0xff])]);
  return hexEncode(result);
}

/** utils version of G79 HTTP decryption. */
function g79UtilsHttpDecrypt(data) {
  const bytes = hexDecode(data);
  if (bytes.length < 17) {
    throw new Error(`utils.G79HttpDecrypt: data too short: len=${bytes.length}`);
  }
  const info = bytes[bytes.length - 1];
  const version = info & 0x0f;
  if (version !== 0x04) {
    throw new Error(`utils.G79HttpDecrypt: invalid version: ${version}`);
  }
  const index = (info >> 4) & 0x0f;
  const iv = bytes.subarray(0, 16);
  const encrypted = bytes.subarray(16, bytes.length - 1);
  const key = g79PickKey(index);
  const decrypted = aesCbcDecrypt(encrypted, key, iv);

  let dropPos = decrypted.length - 1;
  while (dropPos >= 0 && decrypted[dropPos] === 0) dropPos -= 1;
  if (dropPos < 15) {
    throw new Error("utils.G79HttpDecrypt: invalid decrypted data (no valid content)");
  }
  dropPos -= 16;
  return decrypted.subarray(0, dropPos + 1).toString("utf8");
}

// Constant table used by PeAuthSign.
const SIGN_B = Buffer.from([
  0x62, 0x25, 0x1e, 0xf6, 0x40, 0xb3, 0x40, 0xc0, 0x51, 0x5a, 0x5e, 0x26, 0xaa, 0xc7, 0xb6, 0xe9,
  0x44, 0xea, 0xbe, 0xa4, 0xa9, 0xcf, 0xde, 0x4b, 0x60, 0x4b, 0xbb, 0xf6, 0x70, 0xbc, 0xbf, 0xbe,
  0xc3, 0x59, 0x5b, 0x65, 0x92, 0xcc, 0x0c, 0x8f, 0x7d, 0xf4, 0xef, 0xff, 0xd1, 0x5d, 0x84, 0x85,
  0xc6, 0x7e, 0x9b, 0x28, 0xfa, 0x27, 0xa1, 0xea, 0x85, 0x30, 0xef, 0xd4, 0x05, 0x1d, 0x88, 0x04,
  0xe6, 0xcd, 0xe1, 0x21, 0xd6, 0x07, 0x37, 0xc3, 0x87, 0x0d, 0xd5, 0xf4, 0xed, 0x14, 0x5a, 0x45,
]);

const SIGN_Q = Buffer.from([
  0x01, 0x06, 0x0a, 0x0d, 0x02, 0x05, 0x09, 0x0e, 0x04, 0x07, 0x0b, 0x03, 0x03, 0x08, 0x0b, 0x05,
  0x01, 0x07, 0x0b, 0x0e,
]);

const u32 = (v) => v >>> 0;
const and32 = (a, b) => (a & b) >>> 0;
const or32 = (a, b) => (a | b) >>> 0;
const xor32 = (a, b) => (a ^ b) >>> 0;
const not32 = (a) => (~a) >>> 0;

/**
 * Generate the PE authentication signature.
 * Mirrors Go utils.PeAuthSign(v string, sp, tr int) (string, error).
 * @returns {string} Base64-encoded 16-byte signature
 */
function peAuthSign(v, sp, tr) {
  if (!Number.isInteger(sp) || sp < 0 || !Number.isInteger(tr) || tr <= 0) {
    throw new Error("PeAuthSign: invalid sp/tr parameters");
  }
  if (16 * sp + 16 > SIGN_B.length) {
    throw new Error(`PeAuthSign: sp=${sp} out of range for constant table`);
  }
  if (4 * sp + 4 > SIGN_Q.length) {
    throw new Error(`PeAuthSign: sp=${sp} out of range for shift table`);
  }

  let s = String(v);
  const rem = s.length % 4;
  if (rem !== 0) s += "0".repeat(4 - rem);

  const a = Buffer.from(s, "utf8");
  const p = [];
  for (let i = 0; i < a.length; i += 4) {
    p.push(((a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3]) >>> 0);
  }

  const wordRem = p.length % 64;
  if (wordRem !== 0) {
    for (let i = 0; i < 64 - wordRem; i += 1) {
      p.push(0xabcde987);
    }
  }

  const c = [];
  for (let i = 0; i < 4; i += 1) {
    c.push(SIGN_B.readUInt32LE(16 * sp + i * 4));
  }
  const q = [];
  for (let i = 0; i < 4; i += 1) {
    q.push(SIGN_Q[4 * sp + i]);
  }

  let r = 0x67452301;
  let u = 0xefcdab89;
  let x = 0x98badcfe;
  let z = 0x10325476;

  for (let t = 0; t < tr; t += 1) {
    for (let j = 0; j < p.length; j += 4) {
      const a1 = r + or32(and32(u, x), and32(not32(u), z));
      r = u32(u + Math.pow(2, q[0]) * (a1 + p[j] + c[0]));

      const a2 = r + or32(and32(u, z), and32(not32(z), x));
      u = u32(u + Math.pow(2, q[1]) * (a2 + p[j] + c[1]));

      const a3 = r + xor32(xor32(u, x), z);
      x = u32(u + Math.pow(2, q[2]) * (a3 + p[j] + c[2]));

      const term = xor32(x, or32(u, z));
      const a4 = r + term;
      z = u32(u + Math.pow(2, q[3]) * (a4 + p[j] + c[3]));
    }
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(r >>> 0, 0);
  out.writeUInt32LE(u >>> 0, 4);
  out.writeUInt32LE(x >>> 0, 8);
  out.writeUInt32LE(z >>> 0, 12);
  return out.toString("base64");
}

module.exports = {
  getEncryptedToken,
  g79GetDynamicHttpToken,
  encryptToken,
  g79PickKey,
  g79UtilsHttpEncrypt,
  g79UtilsHttpDecrypt,
  peAuthSign,
  // Go-style aliases
  GetEncryptedToken: getEncryptedToken,
  G79GetDynamicHttpToken: g79GetDynamicHttpToken,
  G79PickKey: g79PickKey,
  G79UtilsHttpEncrypt: g79UtilsHttpEncrypt,
  G79UtilsHttpDecrypt: g79UtilsHttpDecrypt,
  // Corresponds to the same-named functions in Go's utils package
  G79HttpEncrypt: g79UtilsHttpEncrypt,
  G79HttpDecrypt: g79UtilsHttpDecrypt,
  PeAuthSign: peAuthSign,
};
