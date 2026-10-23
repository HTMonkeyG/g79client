"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { peAuthSign, g79PickKey, g79UtilsHttpEncrypt, g79UtilsHttpDecrypt, getEncryptedToken } = require("../utils/encryption.js");
const { aesEcbEncrypt, aesEcbEncryptBlock, aesEcbDecrypt } = require("../utils/aes.js");
const { hexDecode } = require("../utils/bytes.js");
const { Uncertain, toInt, toBool, toStr } = require("../types.js");
const cryptoModule = require("../crypto.js");
const fs = require("node:fs");
const path = require("node:path");

test("PeAuthSign 与 Go 参考实现一致", () => {
  const message = "3.4.5.273121815873bdd82cb7a4ce422da361f7d60d3.6.18.28312722c622f4245a37ec3f1012a5325ddc252b3e7ca013bb30a74d822579860c042b8888777a-03ff-4075-a3f3-e30363cc763b";
  assert.equal(peAuthSign(message, 2, 9), "Sdj02AnzWPsJ45fRkdACxQ==");
});

test("官方 PE 样本签名可复现（sp=1,tr=8）", () => {
  const file = path.join(__dirname, "fixtures/peauth_hex.txt");
  const hex = fs.readFileSync(file, "utf8").trim();
  const data = JSON.parse(
    cryptoModule.GetValidJSON(
      cryptoModule.G79HttpDecrypt(hexDecode(hex)),
    ).toString("utf8"),
  );
  assert.equal(peAuthSign(data.message, 1, 8), data.sign);
});

test("AES-ECB 与 Go 参考实现一致", () => {
  const key = hexDecode("000102030405060708090a0b0c0d0e0f");
  const plaintext = Buffer.from("{\"username\":\"a@b.com\",\"password\":\"abc\",\"unique_id\":\"x\"}");
  assert.equal(
    aesEcbEncrypt(plaintext, key).toString("hex"),
    "ee74598de59486c6787eac74333c034c1093f75eeaec0995764ae652d9ccffa87db9a17cc63e3a25e325405ee06ba9f052badfa3c911b08a47b5262fc2846d4a",
  );

  const block = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) block[i] = (i * 3) & 0xff;
  assert.equal(
    aesEcbEncryptBlock(block, key).toString("hex"),
    "551b13ba85ed16edfc1e337a28b37ab8",
  );
  assert.deepEqual(aesEcbDecrypt(aesEcbEncrypt(plaintext, key), key), plaintext);
});

test("G79PickKey 与异或处理", () => {
  const key = g79PickKey(0);
  assert.equal(key.length, 16);
  assert.equal(key[0], (0x1c ^ 0x7c));
  assert.throws(() => g79PickKey(16));
});

test("utils G79 HTTP 加密/解密往返", () => {
  const encrypted = g79UtilsHttpEncrypt("{\"ok\":true}");
  assert.match(encrypted, /^[0-9a-f]+$/);
  assert.equal(g79UtilsHttpDecrypt(encrypted), "{\"ok\":true}");
});

test("GetEncryptedToken 返回 16 字节 MD5", () => {
  const crypto = require("node:crypto");
  const token = getEncryptedToken("token123");
  assert.equal(token.length, 16);
  assert.equal(token.toString("hex"), crypto.createHash("md5").update("token123").digest("hex"));
});

test("Uncertain 兼容服务端的混合类型", () => {
  assert.equal(new Uncertain("1").bool(), true);
  assert.equal(new Uncertain("0").bool(), false);
  assert.equal(new Uncertain("true").bool(), true);
  assert.equal(new Uncertain("12").int64(), 12);
  assert.equal(new Uncertain("").int64(), 0);
  assert.equal(new Uncertain("1.5").float64(), 1.5);
  assert.equal(Uncertain.from("hello").toString(), "hello");
  assert.equal(JSON.stringify(Uncertain.from("hello")), "\"hello\"");
  assert.equal(Uncertain.from(12).int64(), 12);

  assert.equal(toInt("42"), 42);
  assert.equal(toInt("x"), 0);
  assert.equal(toBool("1"), true);
  assert.equal(toBool(1), true);
  assert.equal(toStr(null), "");
});
