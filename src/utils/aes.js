'use strict';

const crypto = require('node:crypto');
const { pkcs7Pad, pkcs7Unpad } = require('./bytes');

/** 校验 AES 密钥长度（16/24/32 字节）。 */
function validateKey(key) {
  const buf = Buffer.from(key);
  if (buf.length !== 16 && buf.length !== 24 && buf.length !== 32) {
    throw new Error(`aes: invalid key size ${buf.length}`);
  }
  return buf;
}

function validateIv(iv) {
  const buf = Buffer.from(iv);
  if (buf.length !== 16) {
    throw new Error(`aes: invalid iv size ${buf.length}`);
  }
  return buf;
}

/** AES-CBC 加密（无自动填充）。 */
function aesCbcEncrypt(plaintext, key, iv) {
  const keyBuf = validateKey(key);
  const ivBuf = validateIv(iv);
  const data = Buffer.from(plaintext);
  const alg = `aes-${keyBuf.length * 8}-cbc`;
  const cipher = crypto.createCipheriv(alg, keyBuf, ivBuf);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-CBC 解密（无自动填充）。 */
function aesCbcDecrypt(ciphertext, key, iv) {
  const keyBuf = validateKey(key);
  const ivBuf = validateIv(iv);
  const data = Buffer.from(ciphertext);
  const alg = `aes-${keyBuf.length * 8}-cbc`;
  const decipher = crypto.createDecipheriv(alg, keyBuf, ivBuf);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** AES-ECB 解密（无自动填充），用于需要逐块处理的场景。 */
function aesEcbDecryptBlock(ciphertext, key) {
  const keyBuf = validateKey(key);
  const data = Buffer.from(ciphertext);
  if (data.length % 16 !== 0) {
    throw new Error('aes ecb decrypt: ciphertext length is not block aligned');
  }
  const decipher = crypto.createDecipheriv(`aes-${keyBuf.length * 8}-ecb`, keyBuf, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * AES-ECB 加密（PKCS#7 填充）。
 * 对应 Go utils.AesECBEncrypt / pyaes.AESModeOfOperationECB。
 */
function aesEcbEncrypt(plaintext, key) {
  const keyBuf = validateKey(key);
  const padded = pkcs7Pad(Buffer.from(plaintext), 16);
  return aesEcbEncryptBlock(padded, keyBuf);
}

/** AES-ECB 加密（无填充）。 */
function aesEcbEncryptBlock(plaintext, key) {
  const keyBuf = validateKey(key);
  const data = Buffer.from(plaintext);
  if (data.length % 16 !== 0) {
    throw new Error(`aes ecb encrypt: plaintext length ${data.length} is not block aligned`);
  }
  const cipher = crypto.createCipheriv(`aes-${keyBuf.length * 8}-ecb`, keyBuf, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * AES-ECB 解密并去除 PKCS#7 填充。
 * 注意：Go 版本只提供加密函数，这里补齐解密便于测试与使用。
 */
function aesEcbDecrypt(ciphertext, key) {
  const plain = aesEcbDecryptBlock(ciphertext, key);
  return pkcs7Unpad(plain, 16);
}

module.exports = {
  aesCbcEncrypt,
  aesCbcDecrypt,
  aesEcbEncrypt,
  aesEcbEncryptBlock,
  aesEcbDecrypt,
  aesEcbDecryptBlock,
  validateKey,
  validateIv,
  // Go 风格别名
  AesCBCEncrypt: aesCbcEncrypt,
  AesCBCDecrypt: aesCbcDecrypt,
  AesECBEncrypt: aesEcbEncrypt,
  AesECBEncryptBlock: aesEcbEncryptBlock,
  AesECBDecrypt: aesEcbDecrypt,
  AesECBDecryptBlock: aesEcbDecryptBlock,
};
