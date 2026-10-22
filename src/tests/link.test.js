'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  LinkConnection,
  writeVarInt,
  readVarInt,
} = require('../services/link_connection/connection');
const { newNeteaseChaCha } = require('../utils/chacha8');

const ENC_KEY = Buffer.alloc(32, 0x11);
const DEC_KEY = Buffer.alloc(32, 0x22);

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
  }

  write(data, callback) {
    this.writes.push(Buffer.from(data));
    if (callback) callback();
    return true;
  }

  destroy() {
    this.emit('close');
  }
}

function buildFrame(serverId, method, payload, engine) {
  const methodBuf = Buffer.from(method, 'utf8');
  const body = Buffer.concat([
    writeVarInt(serverId),
    Buffer.from([0x00, methodBuf.length]),
    methodBuf,
    Buffer.from(payload === undefined ? '' : JSON.stringify(payload), 'utf8'),
  ]);
  const encrypted = engine.process(body);
  return Buffer.concat([writeVarInt(encrypted.length), encrypted]);
}

function parseFrame(frame, engine) {
  const lengthInfo = readVarInt(frame, 0);
  assert.ok(lengthInfo.ok);
  const body = frame.subarray(lengthInfo.size, lengthInfo.size + lengthInfo.value);
  const plain = engine.process(body);
  const serverInfo = readVarInt(plain, 0);
  const off = serverInfo.size;
  const flag = plain[off];
  const methodLen = plain[off + 1];
  const method = plain.subarray(off + 2, off + 2 + methodLen).toString('utf8');
  const payload = plain.subarray(off + 2 + methodLen).toString('utf8');
  return { serverId: serverInfo.value, flag, method, payload };
}

test('Link 连接的消息分帧、登录与公共频道推送', async (t) => {
  const socket = new FakeSocket();
  const service = {
    client: {
      getUserIdInt: () => 12345,
      userToken: 'token',
    },
  };
  const conn = new LinkConnection(service, socket, { ip: '127.0.0.1', port: 1 });
  t.after(() => conn.close());

  // 构造完成后应立即发出 RSA 握手包（256 字节密文 + 16 字节客户端公钥 MD5）
  assert.equal(socket.writes.length, 1);
  assert.equal(socket.writes[0].length, 272);

  // 跳过真实 RSA 握手，直接注入加解密引擎
  conn.handshakeDone = true;
  conn.encrypt = newNeteaseChaCha(ENC_KEY);
  conn.decrypt = newNeteaseChaCha(DEC_KEY);

  // 服务端侧独立引擎（避免与客户端引擎共享密钥流位置）
  const serverEncrypt = newNeteaseChaCha(DEC_KEY);
  const serverDecrypt = newNeteaseChaCha(ENC_KEY);

  // 登录响应
  const loginPromise = conn.waitForLogin();
  conn._handleData(buildFrame(0, 'LoginV2', { code: 0 }, serverEncrypt));

  // CommonPush 推送
  conn._handleData(buildFrame(0, 'CommonPush', {
    type: 'GlobalMessage',
    payload: { text: 'hello' },
  }, serverEncrypt));

  await loginPromise;
  assert.equal(conn.IsOnline(), true);

  const message = await conn.Messages().next();
  assert.equal(message.done, false);
  assert.equal(message.value.method, 'CommonPush');
  assert.equal(message.value.json.type, 'GlobalMessage');

  const push = await conn.CommonPushMessages().next();
  assert.equal(push.done, false);
  assert.equal(push.value.type, 'GlobalMessage');
  assert.equal(push.value.method, 'CommonPush');
  assert.equal(push.value.serverId, 0);

  // 客户端发送消息的帧格式
  await conn.SendMessage(112, 'SendMessage', Buffer.from('{"msg":"hi"}', 'utf8'));
  assert.equal(socket.writes.length, 2);
  const parsed = parseFrame(socket.writes[1], serverDecrypt);
  assert.equal(parsed.serverId, 112);
  assert.equal(parsed.flag, 0);
  assert.equal(parsed.method, 'SendMessage');
  assert.equal(parsed.payload, '{"msg":"hi"}');

  // 模拟服务端主动关闭
  socket.emit('close');
  assert.equal(conn.IsOnline(), false);
  assert.ok(conn.Err() instanceof Error);
  assert.match(conn.Err().message, /EOF|closed/i);

  await conn.Close();
});

test('Link varint 编解码', () => {
  for (const value of [0, 1, 127, 128, 300, 16384, 0x7fffffff]) {
    const encoded = writeVarInt(value);
    const decoded = readVarInt(encoded, 0);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.value, value);
    assert.equal(decoded.size, encoded.length);
  }
});
