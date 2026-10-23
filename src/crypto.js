"use strict";

/**
 * JavaScript implementation of the root crypto.go.
 * Includes G79 / X19 HTTP payload encryption, dynamic token calculation, and JSON boundary trimming.
 */

const crypto = require("node:crypto");
const {
  randomBytes,
  randomString,
  hexDecode,
  hexEncode,
  base64Encode,
  md5Hex,
  pkcs7Pad,
  toBuffer,
} = require("./utils/bytes.js");
const { aesCbcEncrypt, aesCbcDecrypt } = require("./utils/aes.js");

// The 16 AES keys used by G79 (hex, 32 chars = 16 bytes).
const G79_KEYS = [
  "60F1E0D1FD635362430747215CF1C2FF",
  "EA5B62D27D0338374852C4B9469D7AC6",
  "17238D55501C5F020B155FB3303591E6",
  "8C5CEAE0F443E006A050266F73ADD5B0",
  "1C02CE22FB22F0E72060217418F351F3",
  "9A01773FEBB0CFE0EBDBF37F4D23C27F",
  "43F32300BF252CC320E2572ACE766367",
  "07F161011B3101F1ED0301735631E734",
  "0454E7707A5F37565601E100406060AF",
  "647554BAD3100C43C16660F002CC10F3",
  "E157213170F842382032564265B0B043",
  "914FC59311B04151393EF6896A847636",
  "0710C0205D224237025323265C145FA1",
  "054E6F01165267025C3111F562A921E9",
  "722D1789E792E2CA0D5322211FD0F5AE",
  "91F7C751FCF671F34943430772341799",
];

// The 16 AES-128 keys used by X19 (ASCII, 16 bytes).
const X19_KEYS = [
  "MK6mipwmOUedplb6",
  "OtEylfId6dyhrfdn",
  "VNbhn5mvUaQaeOo9",
  "bIEoQGQYjKd02U0J",
  "fuaJrPwaH2cfXXLP",
  "LEkdyiroouKQ4XN1",
  "jM1h27H4UROu427W",
  "DhReQada7gZybTDk",
  "ZGXfpSTYUvcdKqdY",
  "AZwKf7MWZrJpGR5W",
  "amuvbcHw38TcSyPU",
  "SI4QotspbjhyFdT0",
  "VP4dhjKnDGlSJtbB",
  "UXDZx4KhZywQ2tcn",
  "NIK73ZNvNqzva4kd",
  "WeiW7qU766Q1YQZI",
];

const SALT = "0eGsBkhl";

/**
 * G79 HTTP encryption (AES-CBC, no PKCS#7 padding).
 * Appends 16 random bytes, then zero-pads to a 16-byte boundary;
 * output format is IV(16) + ciphertext + flag(1).
 * @param {Buffer|string} body
 * @returns {Buffer}
 */
function g79HttpEncrypt(body) {
  const input = toBuffer(body);
  const blockSize = 16;
  // Equivalent to Go ((len + 16 + 15) / 16) * 16, ensuring at least 16 extra bytes.
  const targetLen = Math.ceil((input.length + blockSize) / blockSize) * blockSize;
  const buffer = Buffer.alloc(targetLen);
  input.copy(buffer);

  const tail = Buffer.from(randomString(16), "latin1");
  tail.copy(buffer, input.length);

  // Go uses rand.Int(..., big.NewInt(15)), so the range is 0..14.
  const highNibble = crypto.randomInt(0, 15);
  const flag = ((highNibble << 4) | 0x0c) & 0xff;

  const iv = Buffer.from(randomString(16), "latin1");
  const keyIndex = (flag >> 4) & 0x0f;
  const key = hexDecode(G79_KEYS[keyIndex]);

  const cipherText = aesCbcEncrypt(buffer, key, iv);
  return Buffer.concat([iv, cipherText, Buffer.from([flag])]);
}

/**
 * G79 HTTP decryption. Removes only trailing 0x00 bytes and keeps the 16-byte random tail.
 * @param {Buffer|Uint8Array} payload
 * @returns {Buffer}
 */
function g79HttpDecrypt(payload) {
  const buf = Buffer.from(payload);
  if (buf.length < 18) {
    throw new Error("payload too short");
  }
  const flag = buf[buf.length - 1];
  const iv = buf.subarray(0, 16);
  const cipherText = buf.subarray(16, buf.length - 1);
  const keyIndex = (flag >> 4) & 0x0f;
  const key = hexDecode(G79_KEYS[keyIndex]);
  const plain = aesCbcDecrypt(cipherText, key, iv);
  return trimTrailingZeros(plain);
}

/** X19 HTTP encryption (AES-CBC + PKCS#7); output format is IV + ciphertext + flag. */
function x19HttpEncrypt(body) {
  const plain = Buffer.concat([toBuffer(body), randomBytes(16)]);
  const keyIndex = randomBytes(1)[0] % X19_KEYS.length;
  const iv = randomBytes(16);
  const key = Buffer.from(X19_KEYS[keyIndex], "latin1");
  const padded = pkcs7Pad(plain, 16);
  const encrypted = aesCbcEncrypt(padded, key, iv);
  const flag = ((keyIndex << 4) | 0x02) & 0xff;
  return Buffer.concat([iv, encrypted, Buffer.from([flag])]);
}

/** X19 HTTP decryption. The returned plaintext may still contain PKCS#7 padding. */
function x19HttpDecrypt(payload) {
  const buf = Buffer.from(payload);
  if (buf.length < 18) {
    throw new Error("payload too short");
  }
  const flag = buf[buf.length - 1];
  const keyIndex = (flag >> 4) & 0x0f;
  if (keyIndex >= X19_KEYS.length) {
    throw new Error(`invalid key index ${keyIndex}`);
  }
  const iv = buf.subarray(0, 16);
  const cipherText = buf.subarray(16, buf.length - 1);
  const key = Buffer.from(X19_KEYS[keyIndex], "latin1");
  return aesCbcDecrypt(cipherText, key, iv);
}

/**
 * Calculate the G79 dynamic token.
 * @param {string} path Request path
 * @param {string} content Raw request body
 * @param {string} token User token
 * @returns {string}
 */
function calculateDynamicToken(path, content, token) {
  const tokenMd5 = md5Hex(token);
  const normalizedPath = path.endsWith("?") ? path.slice(0, -1) : path;
  const payload = `${tokenMd5}${content}${SALT}${normalizedPath}`;
  const payloadMd5 = md5Hex(payload);

  // Expand the 32 hex characters into a 256-bit binary string
  let binaryString = "";
  for (let i = 0; i < payloadMd5.length; i += 1) {
    binaryString += payloadMd5.charCodeAt(i).toString(2).padStart(8, "0");
  }
  binaryString = binaryString.slice(6) + binaryString.slice(0, 6);

  const transformed = Buffer.from(payloadMd5, "latin1");
  for (let i = 0; i < transformed.length; i += 1) {
    const section = binaryString.slice(i * 8, i * 8 + 8);
    let reversedByte = 0;
    for (let j = 0; j < 8; j += 1) {
      if (section[7 - j] === "1") {
        reversedByte |= 1 << j;
      }
    }
    transformed[i] = (reversedByte ^ transformed[i]) & 0xff;
  }

  const b64 = base64Encode(transformed);
  return `${b64.slice(0, 16).replace(/\+/g, "m").replace(/\//g, "o")}1`;
}

/**
 * Calculate the X19 dynamic token (PC launcher logic).
 * @param {string} url
 * @param {string} content
 * @param {string} token
 * @returns {string}
 */
function x19CalculateDynamicToken(url, content, token) {
  const tokenMd5 = md5Hex(token);
  const magicMd5 = md5Hex(`${tokenMd5}${content}${SALT}${url}`);

  let binary = "";
  for (let i = 0; i < magicMd5.length; i += 1) {
    binary += magicMd5.charCodeAt(i).toString(2).padStart(8, "0");
  }
  const shiftedBin = binary.slice(6) + binary.slice(0, 6);

  const shifted = Buffer.alloc(shiftedBin.length / 8);
  for (let i = 0; i < shifted.length; i += 1) {
    shifted[i] = parseInt(shiftedBin.slice(i * 8, i * 8 + 8), 2);
  }

  const raw = Buffer.from(magicMd5, "latin1");
  const xored = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    xored[i] = raw[i] ^ shifted[i];
  }

  const encoded = base64Encode(xored).replace(/\//g, "o").replace(/\+/g, "m");
  if (encoded.length < 16) {
    throw new Error("token too short");
  }
  return `${encoded.slice(0, 16)}1`;
}

/** Remove trailing 0x00 bytes (internal use). */
function trimTrailingZeros(buf) {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end -= 1;
  if (end === 0) return Buffer.alloc(0);
  return buf.subarray(0, end);
}

/**
 * Extract the first complete JSON object from the decrypted payload.
 * Mirrors Go GetValidJSON.
 */
function getValidJSON(decryptedBody) {
  const buf = Buffer.from(decryptedBody);
  let blocksCount = 0;
  let readableLength = 0;

  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i];
    if (b === 0x7b) {
      blocksCount += 1;
    } else if (b === 0x7d) {
      blocksCount -= 1;
    }
    if (blocksCount === 0 && i !== 0) {
      readableLength = i + 1;
      break;
    }
  }

  return readableLength !== 0 ? buf.subarray(0, readableLength) : buf;
}

module.exports = {
  G79_KEYS,
  X19_KEYS,
  g79HttpEncrypt,
  g79HttpDecrypt,
  x19HttpEncrypt,
  x19HttpDecrypt,
  calculateDynamicToken,
  x19CalculateDynamicToken,
  getValidJSON,
  // Go-style aliases
  G79HttpEncrypt: g79HttpEncrypt,
  G79HttpDecrypt: g79HttpDecrypt,
  X19HttpEncrypt: x19HttpEncrypt,
  X19HttpDecrypt: x19HttpDecrypt,
  CalculateDynamicToken: calculateDynamicToken,
  X19CalculateDynamicToken: x19CalculateDynamicToken,
  GetValidJSON: getValidJSON,
  hexEncode,
};
