"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const mpay = require("../account/mpay/index.js");
const { aesEcbDecrypt } = require("../utils/aes.js");
const { hexDecode } = require("../utils/bytes.js");
const { startServer, writeJSON } = require("./helpers.js");

const DEVICE_KEY = "000102030405060708090a0b0c0d0e0f";

function formOf(body) {
  return body.toString("utf8");
}

test("生成设备并创建游客账号", async (t) => {
  let guestParams = null;
  const server = await startServer((req, res, body) => {
    if (req.url.endsWith("/devices") && req.method === "POST") {
      writeJSON(res, { device: { id: "device-id", key: DEVICE_KEY } }, 201);
      return;
    }
    if (req.url.includes("/users/by_guest")) {
      const form = new URLSearchParams(formOf(body));
      guestParams = form.get("params");
      writeJSON(res, { user: { token: "session-token", id: 123456, udid: "new-udid" } }, 201);
      return;
    }
    writeJSON(res, { code: 404, reason: "not found" }, 404);
  });
  t.after(server.close);

  const client = new mpay.MpayClient({ baseUrl: server.url });
  const device = await client.generateDevice();

  assert.equal(device.id, "device-id");
  assert.equal(device.key, DEVICE_KEY);
  assert.equal(device.mac.length, 32);
  assert.equal(device.udid.length, 16);
  assert.equal(device.extCi.length, 64);
  assert.match(device.uniqueId, /^[0-9a-f-]{36}\d+20114$/);

  const deviceReq = server.requests[0];
  assert.equal(deviceReq.url, "/mpay/games/aecfrxodyqaaaajp-g-x19/devices");
  const deviceForm = new URLSearchParams(formOf(deviceReq.body));
  assert.equal(deviceForm.get("game_id"), "aecfrxodyqaaaajp-g-x19");
  assert.equal(deviceForm.get("app_channel"), "netease");
  assert.equal(deviceForm.get("brand"), "Redmi");
  assert.equal(deviceForm.get("udid").length, 16);

  const guest = await device.guest();
  assert.equal(guest.sauth.sdkuid, "123456");
  assert.equal(guest.sauth.sessionid, "session-token");
  assert.equal(guest.sauth.platform, "pc");
  assert.equal(guest.sauth.is_unisdk_guest, 1);
  assert.equal(guest.isGuest, true);

  const decrypted = aesEcbDecrypt(hexDecode(guestParams), hexDecode(DEVICE_KEY));
  assert.equal(decrypted.toString("utf8"), "{}");

  const cookie = guest.cookieString();
  const parsed = JSON.parse(cookie);
  assert.ok(parsed.sauth_json);
  assert.equal(JSON.parse(parsed.sauth_json).sdkuid, "123456");
});

test("游客生成遇到验证码时抛出 NeedVerifyError", async (t) => {
  const server = await startServer((req, res) => {
    if (req.url.endsWith("/devices")) {
      writeJSON(res, { device: { id: "d", key: DEVICE_KEY } }, 201);
      return;
    }
    writeJSON(res, { code: 1, reason: "need captcha", verify_url: "https://verify.example" }, 201);
  });
  t.after(server.close);

  const client = new mpay.MpayClient({ baseUrl: server.url });
  const device = await client.generateDevice();
  await assert.rejects(
    () => device.guest(),
    (err) => {
      assert.ok(err instanceof mpay.NeedVerifyError);
      assert.equal(err.code, 1);
      assert.equal(err.reason, "need captcha");
      assert.equal(err.verifyUrl, "https://verify.example");
      assert.equal(err.verifyURL, "https://verify.example");
      return true;
    },
  );
});

test("邮箱登录加密参数正确", async (t) => {
  let loginParams = null;
  const server = await startServer((req, res, body) => {
    if (req.url.includes("/users?un=")) {
      const form = new URLSearchParams(formOf(body));
      loginParams = form.get("params");
      writeJSON(res, { user: { token: "mail-token", id: "987654", udid: "udid-x" } });
      return;
    }
    writeJSON(res, { code: 404 }, 404);
  });
  t.after(server.close);

  const client = new mpay.MpayClient({ baseUrl: server.url });
  const device = new mpay.Device({
    key: DEVICE_KEY,
    id: "device-id",
    mcountTransactionId: "mcount",
    transId: "trans",
    uniqueId: "unique",
    udid: "udid",
    mac: "mac",
    ram: "1",
    rom: "2",
    extCi: "ci",
    timestamp: 1,
  }, client);

  const user = await device.loginEmail("user@example.com", "p@ss");
  assert.equal(user.sauth.sdkuid, "987654");
  assert.equal(user.sauth.sessionid, "mail-token");
  assert.equal(user.email, "user@example.com");

  const expectedPassword = crypto.createHash("md5").update("p@ss").digest("hex");
  const decrypted = JSON.parse(
    aesEcbDecrypt(hexDecode(loginParams), hexDecode(DEVICE_KEY)).toString("utf8"),
  );
  assert.deepEqual(decrypted, {
    username: "user@example.com",
    password: expectedPassword,
    unique_id: "unique",
  });
});

test("loginEmailMD5 校验密码摘要", async () => {
  const client = new mpay.MpayClient({ baseUrl: "http://127.0.0.1:1" });
  const device = new mpay.Device({
    key: DEVICE_KEY,
    id: "device-id",
    mcountTransactionId: "m",
    transId: "t",
    uniqueId: "u",
    udid: "udid",
    mac: "mac",
    ram: "1",
    rom: "2",
    extCi: "ci",
    timestamp: 1,
  }, client);

  await assert.rejects(() => device.loginEmailMD5("a@b.c", "short"), /长度非法/);
  await assert.rejects(() => device.loginEmailMD5("a@b.c", "z".repeat(32)), /非法/);
});

test("实名认证表单字段", async (t) => {
  let realnameForm = null;
  const server = await startServer((req, res, body) => {
    if (req.url === "/mpay/api/users/realname/update_by_token") {
      realnameForm = new URLSearchParams(formOf(body));
      writeJSON(res, {});
      return;
    }
    writeJSON(res, { code: 404 }, 404);
  });
  t.after(server.close);

  const client = new mpay.MpayClient({ baseUrl: server.url });
  const device = new mpay.Device({
    key: DEVICE_KEY,
    id: "device-id",
    mcountTransactionId: "m",
    transId: "t",
    uniqueId: "u",
    udid: "udid",
    mac: "mac",
    ram: "1",
    rom: "2",
    extCi: "ci",
    timestamp: 1,
  }, client);

  const user = {
    sauth: { sdkuid: "sdkuid", sessionid: "sess" },
  };
  await device.authRealName(user, "张三", "110101199001011234");

  assert.equal(realnameForm.get("device_id"), "device-id");
  assert.equal(realnameForm.get("user_id"), "sdkuid");
  assert.equal(realnameForm.get("token"), "sess");
  assert.equal(realnameForm.get("realname"), "张三");
  assert.equal(realnameForm.get("id_region"), "86");
  assert.equal(realnameForm.get("id_num"), "110101199001011234");
});
