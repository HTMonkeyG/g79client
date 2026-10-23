"use strict";

const crypto = require("node:crypto");
const { pkcs7Pad, pkcs7Unpad } = require("./bytes.js");

/** Validate the AES key length (16/24/32 bytes). */
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

/** AES-CBC encryption (no automatic padding). */
function aesCbcEncrypt(plaintext, key, iv) {
  const keyBuf = validateKey(key);
  const ivBuf = validateIv(iv);
  const data = Buffer.from(plaintext);
  const alg = `aes-${keyBuf.length * 8}-cbc`;
  const cipher = crypto.createCipheriv(alg, keyBuf, ivBuf);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-CBC decryption (no automatic padding). */
function aesCbcDecrypt(ciphertext, key, iv) {
  const keyBuf = validateKey(key);
  const ivBuf = validateIv(iv);
  const data = Buffer.from(ciphertext);
  const alg = `aes-${keyBuf.length * 8}-cbc`;
  const decipher = crypto.createDecipheriv(alg, keyBuf, ivBuf);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** AES-ECB decryption (no automatic padding), for block-by-block scenarios. */
function aesEcbDecryptBlock(ciphertext, key) {
  const keyBuf = validateKey(key);
  const data = Buffer.from(ciphertext);
  if (data.length % 16 !== 0) {
    throw new Error("aes ecb decrypt: ciphertext length is not block aligned");
  }
  const decipher = crypto.createDecipheriv(`aes-${keyBuf.length * 8}-ecb`, keyBuf, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * AES-ECB encryption (PKCS#7 padding).
 * Mirrors Go utils.AesECBEncrypt / pyaes.AESModeOfOperationECB.
 */
function aesEcbEncrypt(plaintext, key) {
  const keyBuf = validateKey(key);
  const padded = pkcs7Pad(Buffer.from(plaintext), 16);
  return aesEcbEncryptBlock(padded, keyBuf);
}

/** AES-ECB encryption (no padding). */
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
 * AES-ECB decryption with PKCS#7 unpadding.
 * Note: the Go version only provides encryption; decryption is added here for tests and convenience.
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
  // Go-style aliases
  AesCBCEncrypt: aesCbcEncrypt,
  AesCBCDecrypt: aesCbcDecrypt,
  AesECBEncrypt: aesEcbEncrypt,
  AesECBEncryptBlock: aesEcbEncryptBlock,
  AesECBDecrypt: aesEcbDecrypt,
  AesECBDecryptBlock: aesEcbDecryptBlock,
};
