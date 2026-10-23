"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { ChaCha8 } = require("../utils/chacha8.js");
const cryptoModule = require("../crypto.js");
const encryption = require("../utils/encryption.js");
const { hexDecode, hexEncode } = require("../utils/bytes.js");

test("ChaCha8 与 Go 参考实现输出一致", () => {
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) key[i] = i;
  const nonce = Buffer.from("163 NetEase\n", "latin1");

  const out = new ChaCha8(key, nonce).process(Buffer.alloc(256));
  assert.equal(
    out.toString("hex"),
    "3ea028a6a0abac3174ca47d1c923a877e11e9eaf1c900a1555704e4707f68fab93ac6f9d9a0a74bf5a9bd2d2bf0ec5c109f02e3be9d408ea7cdddc0ef04dca49318d770b596cba7ac0367a14a5194c1bb8f878bdd30e02681df7c80539fe00629140a4c9210f71db0054329b323da34edfe62a77a6292c61c0cdb24ef33874583c8a05743b20b070353bf2c475b63ddf6a9776da58ecb497d486590a896f768154cdea9211491cfb42e029c868aa50c2c6787aa7a599ebeaba287c5a0f1fbc38d936bbc236334c658f170feecc769f572f41c6394767327281ab28dbaf462fd9e1d5e475016ea91dfa2aae6ec835593fffa1adb911062ea4747c26232e4fb7f9",
  );
});

test("ChaCha8 多次调用保持密钥流位置", () => {
  const key = Buffer.alloc(32, 7);
  const nonce = Buffer.from("163 NetEase\n", "latin1");
  const engine = new ChaCha8(key, nonce);
  const first = engine.process(Buffer.from([1, 2, 3]));
  const second = engine.process(Buffer.from([4, 5, 6]));
  const combined = Buffer.concat([first, second]);
  const reference = new ChaCha8(key, nonce).process(Buffer.from([1, 2, 3, 4, 5, 6]));
  assert.deepEqual(combined, reference);
});

test("CalculateDynamicToken 与 Go 参考实现一致", () => {
  assert.equal(
    cryptoModule.CalculateDynamicToken("/test", "{\"a\":1}", "token123"),
    "bH1pmjo1rmo9LKoo1",
  );
  assert.equal(
    cryptoModule.CalculateDynamicToken("/authentication-otp", "{\"x\":\"中文\"}", ""),
    "PP7vmq55PCj6OP9q1",
  );
});

test("X19CalculateDynamicToken 与 Go 参考实现一致", () => {
  assert.equal(
    cryptoModule.X19CalculateDynamicToken("/test", "{\"a\":1}", "token123"),
    "bH1pmjo1rmo9LKoo1",
  );
});

test("utils 版本的动态 Token 与 Go 参考实现一致", () => {
  assert.equal(
    encryption.G79GetDynamicHttpToken("token123", "/test", "{\"a\":1}"),
    "bH1pmjo1rmo9LKoo1",
  );
});

test("G79 HTTP 加密/解密往返", () => {
  const body = Buffer.from("{\"hello\":\"world\"}", "utf8");
  const encrypted = cryptoModule.G79HttpEncrypt(body);
  assert.ok(encrypted.length >= 18);
  assert.equal(encrypted.length % 16, 1);
  const decrypted = cryptoModule.G79HttpDecrypt(encrypted);
  assert.ok(decrypted.length > body.length);
  assert.equal(decrypted.subarray(0, body.length).toString("utf8"), body.toString("utf8"));
  const valid = cryptoModule.GetValidJSON(decrypted);
  assert.equal(valid.toString("utf8"), body.toString("utf8"));
});

test("X19 HTTP 加密/解密往返", () => {
  const body = Buffer.from("{\"hello\":\"世界\"}", "utf8");
  const encrypted = cryptoModule.X19HttpEncrypt(body);
  const decrypted = cryptoModule.X19HttpDecrypt(encrypted);
  const valid = cryptoModule.GetValidJSON(decrypted);
  assert.equal(valid.toString("utf8"), body.toString("utf8"));
});

test("X19 解密样本文件", () => {
  const dir = path.join(__dirname, "fixtures");
  const request = fs.readFileSync(path.join(dir, "x19_request.data"));
  const response = fs.readFileSync(path.join(dir, "x19_response.data"));

  const reqPlain = cryptoModule.GetValidJSON(cryptoModule.X19HttpDecrypt(request)).toString("utf8");
  const req = JSON.parse(reqPlain);
  assert.equal(req.aid, "346442737");
  assert.equal(req.otp_token, "Ya6xIcpCuSSflZVX");

  const respPlain = cryptoModule.GetValidJSON(cryptoModule.X19HttpDecrypt(response)).toString("utf8");
  const resp = JSON.parse(respPlain);
  assert.equal(resp.code, 0);
  assert.equal(resp.entity.entity_id, "345276684");
});

test("GetValidJSON 截取第一个完整 JSON", () => {
  const data = Buffer.from("{\"a\":1}randomtail\u0000\u0000", "utf8");
  assert.equal(cryptoModule.GetValidJSON(data).toString("utf8"), "{\"a\":1}");
});

test("G79 解密 PeAuth 样本", () => {
  const hex = fs.readFileSync(path.join(__dirname, "fixtures/peauth_hex.txt"), "utf8").trim();
  const plain = cryptoModule.GetValidJSON(
    cryptoModule.G79HttpDecrypt(hexDecode(hex)),
  ).toString("utf8");
  const data = JSON.parse(plain);
  assert.equal(data.extra_param, "extra");
  assert.ok(data.message.startsWith(data.engine_version));
});

test("hex 编解码", () => {
  assert.equal(hexEncode(Buffer.from([0, 1, 255])), "0001ff");
  assert.deepEqual(hexDecode("0001ff"), Buffer.from([0, 1, 255]));
  assert.throws(() => hexDecode("abc"));
  assert.throws(() => hexDecode("zz"));
});
