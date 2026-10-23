"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");

const { FrameReader, wrapFrame, HANDSHAKE_REQUEST_CMD } = require("../services/chat_connection/define.js");
const { ChatConnectionService } = require("../services/chat_connection/service.js");
const { CommandChatPrivate } = require("../services/chat_connection/chat_const.js");
const { newNeteaseChaCha } = require("../utils/chacha8.js");
const { aesEcbEncryptBlock } = require("../utils/aes.js");
const { hexDecode } = require("../utils/bytes.js");
const { makeClient } = require("./helpers.js");

const TOKEN = "00112233445566778899aabbccddeeff";

test("聊天连接完成握手并收发加密消息", async (t) => {
  const key = hexDecode(TOKEN);
  let serverError = null;
  let resolveServerDone;
  const serverDone = new Promise((resolve) => { resolveServerDone = resolve; });

  const server = net.createServer((socket) => {
    const reader = new FrameReader(socket);
    (async () => {
      const handshake = await reader.readFrame();
      assert.ok(handshake);
      assert.equal(handshake.readUInt16LE(0), 1);
      assert.equal(handshake.readUInt16LE(2), HANDSHAKE_REQUEST_CMD);

      const rand = Buffer.from(handshake.subarray(4, 20));
      const aesRand = Buffer.from(handshake.subarray(20, 36));
      const uid = handshake.readUInt32LE(36);
      assert.equal(uid, 12345);
      assert.deepEqual(aesRand, aesEcbEncryptBlock(rand, key));

      // Handshake succeeded (the client only checks frame[4] === 0)
      socket.write(wrapFrame(Buffer.from([0, 0, 0, 0, 0])));

      const decrypt = newNeteaseChaCha(Buffer.concat([key, rand]));
      const encrypt = newNeteaseChaCha(Buffer.concat([rand, key]));

      const clientFrame = await reader.readFrame();
      assert.ok(clientFrame);
      assert.equal(clientFrame.readUInt16LE(0), 2); // First client sequence number
      const plain = decrypt.process(clientFrame.subarray(2));
      assert.equal(plain.readUInt16LE(0), CommandChatPrivate);
      assert.deepEqual(JSON.parse(plain.subarray(2).toString("utf8")), [999, "你好"]);

      // Send one message to the client
      const body = Buffer.alloc(2 + 6);
      body.writeUInt16LE(123, 0);
      body.write("server", 2, "utf8");
      const encrypted = encrypt.process(body);
      const message = Buffer.concat([Buffer.from([0x01, 0x00]), encrypted]);
      socket.write(wrapFrame(message));

      resolveServerDone();
      // Simulate the server actively closing the connection
      setTimeout(() => socket.destroy(), 20);
    })().catch((err) => {
      serverError = err;
      resolveServerDone();
      socket.destroy();
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const client = makeClient("http://127.0.0.1:1");
  client.userToken = TOKEN;
  const svc = new ChatConnectionService(client);
  const endpoint = {
    host: "127.0.0.1",
    port,
    entry: { ip: "127.0.0.1", port, ispEnabled: 0, ctccHost: "", cmccHost: "", cuccHost: "" },
  };

  const conn = await svc.dialWithEndpoint(endpoint, { timeoutMs: 3000 });
  t.after(() => conn.Close());

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("等待消息超时")), 3000);
    timer.unref?.();
    conn.onMessage((msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
  const closed = new Promise((resolve) => conn.events.once("close", resolve));

  const sn = await conn.ChatTo(999, "你好");
  assert.equal(sn, 2);
  const msg = await received;
  assert.equal(msg.sequence, 1);
  assert.equal(msg.command, 123);
  assert.equal(msg.payload.toString("utf8"), "server");

  await serverDone;
  if (serverError) throw serverError;

  // After the server closes, the connection should enter the closed state and record an error
  await closed;
  assert.equal(conn.IsOnline(), false);
  assert.ok(conn.Err() instanceof Error);
  assert.match(conn.Err().message, /EOF|closed|ECONNRESET/i);

  await conn.Close();
});

test("聊天服务根据 ISP 选择域名并回退到 IP", () => {
  const { resolveHostByISP } = require("../services/chat_connection/service.js");
  const entry = {
    ip: "1.1.1.1",
    ispEnabled: 1,
    ctccHost: "ctcc.example",
    cmccHost: "cmcc.example",
    cuccHost: "cucc.example",
  };
  assert.equal(resolveHostByISP(entry, 10000), "ctcc.example");
  assert.equal(resolveHostByISP(entry, 10010), "cucc.example");
  assert.equal(resolveHostByISP(entry, 10086), "cmcc.example");
  assert.equal(resolveHostByISP(entry, 0), "1.1.1.1");

  const disabled = { ...entry, ispEnabled: 0 };
  assert.equal(resolveHostByISP(disabled, 10000), "1.1.1.1");

  const noIp = { ...entry, ip: "" };
  assert.equal(resolveHostByISP(noIp, 0), "ctcc.example");
});

test("聊天 token 推导支持十六进制/Base64/原始字节", () => {
  const { decodeToken } = require("../services/chat_connection/token.js");
  assert.equal(decodeToken(TOKEN).toString("hex"), TOKEN);
  assert.equal(decodeToken(Buffer.alloc(32, 1).toString("base64")).length, 32);
  assert.equal(decodeToken("abcdefghijklmnopqrstuvwxyz01234!").length, 32);
  assert.throws(() => decodeToken("short"), /无法根据 token 推导有效密钥长度/);
});
