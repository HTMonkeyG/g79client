"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const cryptoModule = require("../crypto.js");
const { peAuthSign } = require("../utils/encryption.js");
const { hexEncode, hexDecode } = require("../utils/bytes.js");
const { startServer, writeJSON, makeClient } = require("./helpers.js");

const SAUTH = {
  gameid: "x19",
  login_channel: "netease",
  app_channel: "netease",
  platform: "pc",
  sdkuid: "sdkuser",
  sessionid: "session-id",
  sdk_version: "3.9.0",
  udid: "udid-123",
  deviceid: "device-123",
  aim_info: "{\"aim\":\"127.0.0.1\",\"country\":\"CN\",\"tz\":\"+0800\",\"tzid\":\"\"}",
  client_login_sn: "OLD",
  gas_token: "",
  source_platform: "pc",
  ip: "127.0.0.1",
};

function makeCookie() {
  return JSON.stringify({ sauth_json: JSON.stringify(SAUTH) });
}

test("G79 Cookie 认证完整流程", async (t) => {
  let peauth = null;
  const server = await startServer((req, res, body) => {
    if (req.url === "/pe-authentication") {
      const decrypted = cryptoModule.GetValidJSON(
        cryptoModule.G79HttpDecrypt(hexDecode(body.toString("utf8"))),
      );
      peauth = JSON.parse(decrypted.toString("utf8"));
      const response = cryptoModule.G79HttpEncrypt(Buffer.from(JSON.stringify({
        code: 0,
        entity: { entity_id: "42", token: "user-token", seed: "server-seed" },
      })));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(hexEncode(response));
      return;
    }
    if (req.url === "/pe-user-detail/get") {
      writeJSON(res, { code: 0, entity: { name: "Tester", level: 1 } });
      return;
    }
    writeJSON(res, { code: 404, message: "not found" }, 404);
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.G79AuthenticateWithCookie(makeCookie());

  assert.equal(client.userId, "42");
  assert.equal(client.userToken, "user-token");
  assert.equal(client.seed, "server-seed");
  assert.equal(client.userDetail.name, "Tester");
  assert.equal(client.cookie, makeCookie());

  assert.equal(peauth.engine_version, "3.4.5.273121");
  assert.equal(peauth.patch_version, "3.4.18.283127");
  assert.equal(peauth.pay_channel, "dashen_cloudgame");
  assert.equal(peauth.extra_param, "extra");
  assert.match(peauth.seed, /^[0-9a-f-]{36}$/i);
  assert.ok(peauth.message.endsWith(peauth.seed));
  assert.equal(peauth.sign, peAuthSign(peauth.message, 2, 9));

  const saData = JSON.parse(peauth.sa_data);
  assert.equal(saData.app_ver, "3.4.18.283127");
  assert.equal(saData.udid, "udid-123");
  assert.equal(saData.launcher_type, "PE_C++");

  assert.equal(peauth.sauth_json.sdkuid, "sdkuser");
  assert.equal(peauth.sauth_json.platform, "ad");
  assert.equal(peauth.sauth_json.step, "695616851");
  assert.equal(peauth.sauth_json.client_login_sn.length, 32);

  const detailReq = server.requests.find((r) => r.url === "/pe-user-detail/get");
  assert.equal(detailReq.headers["user-id"], "42");
  assert.equal(
    detailReq.headers["user-token"],
    cryptoModule.CalculateDynamicToken("/pe-user-detail/get", "{}", "user-token"),
  );
});

test("X19 Cookie 认证完整流程", async (t) => {
  let authPayloadText = null;
  const cookie = makeCookie();
  const server = await startServer((req, res, body) => {
    if (req.url === "/login-otp") {
      assert.equal(body.toString("utf8"), cookie);
      writeJSON(res, {
        code: 0,
        entity: {
          otp_token: "otp-token",
          aid: 346442737,
          lock_time: 0,
          verify_status: 2,
        },
      });
      return;
    }
    if (req.url === "/authentication-otp") {
      const plain = cryptoModule.GetValidJSON(cryptoModule.X19HttpDecrypt(body));
      authPayloadText = plain.toString("utf8");
      const expectedToken = cryptoModule.CalculateDynamicToken("/authentication-otp", authPayloadText, "");
      assert.equal(req.headers["user-token"], expectedToken);

      const response = cryptoModule.X19HttpEncrypt(Buffer.from(JSON.stringify({
        code: 0,
        entity: { entity_id: "43", token: "x19-token", seed: "x19-seed" },
      })));
      res.writeHead(200);
      res.end(response);
      return;
    }
    if (req.url === "/pe-user-detail/get") {
      writeJSON(res, { code: 0, entity: { name: "X19Tester" } });
      return;
    }
    writeJSON(res, { code: 404, message: "not found" }, 404);
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.X19AuthenticateWithCookie(cookie);

  assert.equal(client.userId, "43");
  assert.equal(client.userToken, "x19-token");
  assert.equal(client.seed, "x19-seed");
  assert.equal(client.userDetail.name, "X19Tester");
  assert.equal(client.releaseJSON.apiGatewayUrl, `${server.url}/x19`);

  const authPayload = JSON.parse(authPayloadText);
  assert.equal(authPayload.aid, "346442737");
  assert.equal(authPayload.otp_token, "otp-token");
  assert.equal(authPayload.version.version, "1.15.7.20505");
  assert.equal(authPayload.is_register, true);
  assert.equal(authPayload.sauth_json, JSON.stringify(SAUTH));
  const saData = JSON.parse(authPayload.sa_data);
  assert.equal(saData.launcher_type, "PC_java");
});

test("PeAuth 认证会转换为 Cookie 流程", async (t) => {
  const server = await startServer((req, res, body) => {
    if (req.url === "/pe-authentication") {
      const response = cryptoModule.G79HttpEncrypt(Buffer.from(JSON.stringify({
        code: 0,
        entity: { entity_id: "44", token: "pe-token", seed: "pe-seed" },
      })));
      res.writeHead(200);
      res.end(hexEncode(response));
      return;
    }
    writeJSON(res, { code: 0, entity: { name: "PeTester" } });
  });
  t.after(server.close);

  const peAuthData = {
    sauth_json: {
      gameid: "x19",
      sdkuid: "sdkuser",
      sessionid: "session-id",
      udid: "udid-123",
      deviceid: "device-123",
    },
  };
  const hex = hexEncode(cryptoModule.G79HttpEncrypt(
    Buffer.from(JSON.stringify(peAuthData)),
  ));

  const client = makeClient(server.url);
  await client.G79AuthenticateWithPeAuth(hex);
  assert.equal(client.userId, "44");
  assert.equal(client.userDetail.name, "PeTester");
});

test("GenerateAuthV2 各变体字段正确", () => {
  const client = makeClient("http://127.0.0.1:1");
  client.userId = "12345";
  client.userDetail = { name: "Tester" };

  const rental = JSON.parse(client.generateRentalGameAuthV2("sid-1", "key"));
  assert.deepEqual(rental, {
    bit: "64",
    clientKey: "key",
    displayName: "Tester",
    engineVersion: "3.4.5.273121",
    netease_sid: "sid-1:RentalGame",
    os_name: "android",
    patchVersion: "3.4.18.283127",
    uid: 12345,
  });

  const pcDomain = JSON.parse(client.generatePCDomainGameAuthV2("sid-2", "key"));
  assert.equal(pcDomain.netease_sid, "sid-2:DomainGame");
  assert.equal(pcDomain.os_name, "windows");
  assert.equal(pcDomain.patchVersion, "");
  assert.equal(pcDomain.pcCheck, "0");
  assert.equal(pcDomain.platform, "pc");

  const lobby = JSON.parse(client.generateLobbyGameAuthV2("room-1", "key"));
  assert.equal(lobby.netease_sid, "room-1:LobbyGame");

  const net = JSON.parse(client.generateNetworkGameAuthV2("room-2", "key"));
  assert.equal(net.netease_sid, "room-2:NetworkGame");

  client.userDetail = null;
  assert.throws(() => client.generateRentalGameAuthV2("x", "k"), /用户信息未初始化/);
});

test("SendAuthV2Request 加密请求并解密响应", async (t) => {
  const payload = JSON.stringify({ bit: "64", uid: 1 });
  const server = await startServer((req, res, body) => {
    const decrypted = cryptoModule.GetValidJSON(
      cryptoModule.G79HttpDecrypt(hexDecode(body.toString("utf8"))),
    ).toString("utf8");
    assert.equal(decrypted, payload);
    assert.equal(
      req.headers["user-token"],
      hexEncode(Buffer.from(cryptoModule.CalculateDynamicToken("/authentication-v2", payload, "token"), "utf8")),
    );
    const response = cryptoModule.G79HttpEncrypt(Buffer.from("{\"code\":0,\"chain\":\"ok\"}"));
    res.writeHead(200);
    res.end(hexEncode(response));
  });
  t.after(server.close);

  const client = makeClient(server.url);
  const result = await client.sendAuthV2Request(payload);
  assert.deepEqual(JSON.parse(result), { code: 0, chain: "ok" });
});

test("Cookie 解析错误信息", async () => {
  const client = makeClient("http://127.0.0.1:1");
  await assert.rejects(
    () => client.G79AuthenticateWithCookie("not-json"),
    /解析Cookie失败/,
  );
  await assert.rejects(
    () => client.G79AuthenticateWithCookie(JSON.stringify({ sauth_json: "not-json" })),
    /解析SauthJSON失败/,
  );
});
