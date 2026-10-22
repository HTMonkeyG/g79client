'use strict';

/**
 * 根包 crypto.go 的 JavaScript 实现。
 * 包含 G79 / X19 两套 HTTP 载荷加密、动态 Token 计算以及 JSON 边界裁剪。
 */

const crypto = require('node:crypto');
const {
  randomBytes,
  randomString,
  hexDecode,
  hexEncode,
  base64Encode,
  md5Hex,
  pkcs7Pad,
  toBuffer,
} = require('./utils/bytes');
const { aesCbcEncrypt, aesCbcDecrypt } = require('./utils/aes');

// G79 使用的 16 个 AES 密钥（十六进制，32 字符 = 16 字节）。
const G79_KEYS = [
  '60F1E0D1FD635362430747215CF1C2FF',
  'EA5B62D27D0338374852C4B9469D7AC6',
  '17238D55501C5F020B155FB3303591E6',
  '8C5CEAE0F443E006A050266F73ADD5B0',
  '1C02CE22FB22F0E72060217418F351F3',
  '9A01773FEBB0CFE0EBDBF37F4D23C27F',
  '43F32300BF252CC320E2572ACE766367',
  '07F161011B3101F1ED0301735631E734',
  '0454E7707A5F37565601E100406060AF',
  '647554BAD3100C43C16660F002CC10F3',
  'E157213170F842382032564265B0B043',
  '914FC59311B04151393EF6896A847636',
  '0710C0205D224237025323265C145FA1',
  '054E6F01165267025C3111F562A921E9',
  '722D1789E792E2CA0D5322211FD0F5AE',
  '91F7C751FCF671F34943430772341799',
];

// X19 使用的 16 个 AES-128 密钥（ASCII，16 字节）。
const X19_KEYS = [
  'MK6mipwmOUedplb6',
  'OtEylfId6dyhrfdn',
  'VNbhn5mvUaQaeOo9',
  'bIEoQGQYjKd02U0J',
  'fuaJrPwaH2cfXXLP',
  'LEkdyiroouKQ4XN1',
  'jM1h27H4UROu427W',
  'DhReQada7gZybTDk',
  'ZGXfpSTYUvcdKqdY',
  'AZwKf7MWZrJpGR5W',
  'amuvbcHw38TcSyPU',
  'SI4QotspbjhyFdT0',
  'VP4dhjKnDGlSJtbB',
  'UXDZx4KhZywQ2tcn',
  'NIK73ZNvNqzva4kd',
  'WeiW7qU766Q1YQZI',
];

const SALT = '0eGsBkhl';

/**
 * G79 HTTP 加密（AES-CBC、无 PKCS#7 填充）。
 * 在原文后追加 16 字节随机字符串，再补 0x00 到 16 字节对齐；
 * 结果格式为 IV(16) + 密文 + flag(1)。
 * @param {Buffer|string} body
 * @returns {Buffer}
 */
function g79HttpEncrypt(body) {
  const input = toBuffer(body);
  const blockSize = 16;
  // 与 Go ((len + 16 + 15) / 16) * 16 等价，保证至少追加 16 字节。
  const targetLen = Math.ceil((input.length + blockSize) / blockSize) * blockSize;
  const buffer = Buffer.alloc(targetLen);
  input.copy(buffer);

  const tail = Buffer.from(randomString(16), 'latin1');
  tail.copy(buffer, input.length);

  // Go 使用 rand.Int(..., big.NewInt(15))，取值范围 0..14。
  const highNibble = crypto.randomInt(0, 15);
  const flag = ((highNibble << 4) | 0x0c) & 0xff;

  const iv = Buffer.from(randomString(16), 'latin1');
  const keyIndex = (flag >> 4) & 0x0f;
  const key = hexDecode(G79_KEYS[keyIndex]);

  const cipherText = aesCbcEncrypt(buffer, key, iv);
  return Buffer.concat([iv, cipherText, Buffer.from([flag])]);
}

/**
 * G79 HTTP 解密。仅去除末尾的 0x00 字节，保留 16 字节随机尾缀。
 * @param {Buffer|Uint8Array} payload
 * @returns {Buffer}
 */
function g79HttpDecrypt(payload) {
  const buf = Buffer.from(payload);
  if (buf.length < 18) {
    throw new Error('payload too short');
  }
  const flag = buf[buf.length - 1];
  const iv = buf.subarray(0, 16);
  const cipherText = buf.subarray(16, buf.length - 1);
  const keyIndex = (flag >> 4) & 0x0f;
  const key = hexDecode(G79_KEYS[keyIndex]);
  const plain = aesCbcDecrypt(cipherText, key, iv);
  return trimTrailingZeros(plain);
}

/** X19 HTTP 加密（AES-CBC + PKCS#7），结果格式为 IV + 密文 + flag。 */
function x19HttpEncrypt(body) {
  const plain = Buffer.concat([toBuffer(body), randomBytes(16)]);
  const keyIndex = randomBytes(1)[0] % X19_KEYS.length;
  const iv = randomBytes(16);
  const key = Buffer.from(X19_KEYS[keyIndex], 'latin1');
  const padded = pkcs7Pad(plain, 16);
  const encrypted = aesCbcEncrypt(padded, key, iv);
  const flag = ((keyIndex << 4) | 0x02) & 0xff;
  return Buffer.concat([iv, encrypted, Buffer.from([flag])]);
}

/** X19 HTTP 解密。返回的明文可能仍带 PKCS#7 填充。 */
function x19HttpDecrypt(payload) {
  const buf = Buffer.from(payload);
  if (buf.length < 18) {
    throw new Error('payload too short');
  }
  const flag = buf[buf.length - 1];
  const keyIndex = (flag >> 4) & 0x0f;
  if (keyIndex >= X19_KEYS.length) {
    throw new Error(`invalid key index ${keyIndex}`);
  }
  const iv = buf.subarray(0, 16);
  const cipherText = buf.subarray(16, buf.length - 1);
  const key = Buffer.from(X19_KEYS[keyIndex], 'latin1');
  return aesCbcDecrypt(cipherText, key, iv);
}

/**
 * 计算 G79 动态 Token。
 * @param {string} path 请求路径
 * @param {string} content 请求体原文
 * @param {string} token 用户 token
 * @returns {string}
 */
function calculateDynamicToken(path, content, token) {
  const tokenMd5 = md5Hex(token);
  const normalizedPath = path.endsWith('?') ? path.slice(0, -1) : path;
  const payload = `${tokenMd5}${content}${SALT}${normalizedPath}`;
  const payloadMd5 = md5Hex(payload);

  // 将 32 个十六进制字符展开成 256 位二进制字符串
  let binaryString = '';
  for (let i = 0; i < payloadMd5.length; i += 1) {
    binaryString += payloadMd5.charCodeAt(i).toString(2).padStart(8, '0');
  }
  binaryString = binaryString.slice(6) + binaryString.slice(0, 6);

  const transformed = Buffer.from(payloadMd5, 'latin1');
  for (let i = 0; i < transformed.length; i += 1) {
    const section = binaryString.slice(i * 8, i * 8 + 8);
    let reversedByte = 0;
    for (let j = 0; j < 8; j += 1) {
      if (section[7 - j] === '1') {
        reversedByte |= 1 << j;
      }
    }
    transformed[i] = (reversedByte ^ transformed[i]) & 0xff;
  }

  const b64 = base64Encode(transformed);
  return `${b64.slice(0, 16).replace(/\+/g, 'm').replace(/\//g, 'o')}1`;
}

/**
 * 计算 X19 动态 Token（PC 启动器逻辑）。
 * @param {string} url
 * @param {string} content
 * @param {string} token
 * @returns {string}
 */
function x19CalculateDynamicToken(url, content, token) {
  const tokenMd5 = md5Hex(token);
  const magicMd5 = md5Hex(`${tokenMd5}${content}${SALT}${url}`);

  let binary = '';
  for (let i = 0; i < magicMd5.length; i += 1) {
    binary += magicMd5.charCodeAt(i).toString(2).padStart(8, '0');
  }
  const shiftedBin = binary.slice(6) + binary.slice(0, 6);

  const shifted = Buffer.alloc(shiftedBin.length / 8);
  for (let i = 0; i < shifted.length; i += 1) {
    shifted[i] = parseInt(shiftedBin.slice(i * 8, i * 8 + 8), 2);
  }

  const raw = Buffer.from(magicMd5, 'latin1');
  const xored = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    xored[i] = raw[i] ^ shifted[i];
  }

  const encoded = base64Encode(xored).replace(/\//g, 'o').replace(/\+/g, 'm');
  if (encoded.length < 16) {
    throw new Error('token too short');
  }
  return `${encoded.slice(0, 16)}1`;
}

/** 去除末尾的 0x00 字节（内部使用）。 */
function trimTrailingZeros(buf) {
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end -= 1;
  if (end === 0) return Buffer.alloc(0);
  return buf.subarray(0, end);
}

/**
 * 从解密后的载荷中截取第一个完整 JSON 对象。
 * 对应 Go 的 GetValidJSON。
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
  // Go 风格别名
  G79HttpEncrypt: g79HttpEncrypt,
  G79HttpDecrypt: g79HttpDecrypt,
  X19HttpEncrypt: x19HttpEncrypt,
  X19HttpDecrypt: x19HttpDecrypt,
  CalculateDynamicToken: calculateDynamicToken,
  X19CalculateDynamicToken: x19CalculateDynamicToken,
  GetValidJSON: getValidJSON,
  hexEncode,
};
