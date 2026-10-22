'use strict';

/**
 * Link 服务器连接（对应 Go 版本 service/link_connection/connection.go）。
 *
 * 协议要点：
 * - 先 RSA 加密发送 16 字节 cipherR1，再发送客户端公钥 MD5
 * - 服务端返回 RSA 加密的 cipherR2，双方拼出 ChaCha8 密钥
 * - 帧格式：varint(长度) + ChaCha8 加密体
 * - 加密体内部：varint(serverID) + flag + methodLen + method + JSON payload
 */

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const {
  randomBytes,
  hexDecode,
  hexEncode,
  md5,
} = require('../../utils/bytes');
const { aesEcbEncryptBlock } = require('../../utils/aes');
const { newNeteaseChaCha } = require('../../utils/chacha8');
const { AsyncQueue } = require('../../utils/async');
const { toInt } = require('../../types');

const HEARTBEAT_INTERVAL_MS = 10 * 1000;
const CHAT_SERVER_ID = 112;
const FALLBACK_RSA_KEY_BYTES = 256;

const SERVER_PUBLIC_KEY_BASE64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArht9ioo6tc3Z7On/80iYjNI+HpxnEpSc0tXC9JLykvwkxluZiLPrlvO6sgkkPsQMBXudGRu335dBCVdwfMefY7wswrQG51U+Nw3xfSSRgSptNV8PcmNjh6EYAluRSy7AZLcWc6+qJ6fJFOeABGYxNwMVvbpDC0R+t7BtcmQCk+4uXP2dsRjJSs6ALlfT7iEs8IL7iRfu1IvomTAc6eJarStgxEBTWdV/d2XfoIshbNYQ9ziBk0iWzHoI15UXFWLL+jZwhQYwzB0f+ilckgFT0IFKU4msUUQ7io4CBY2iI1G0BnSQYwpm84WR0HrgKL7uoxtJQ98iPk2GbZgWFv1OTwIDAQAB';
const CLIENT_PRIVATE_KEY_BASE64 = 'MIIEpAIBAAKCAQEAx/Ipxphk+HO16oMY8HBOpauKgrdBnuQpH3LhJzsEkgYVK88ObW8w5ts3e0+UWCRJYoCwxPT2CPKeUvJr86gt3ajaOSXEej9iudOUcU6C5bARmkET5EXGvRLH7dnqJt0X2oGUG7H4Okit8+4UydcbjLs3VfXZba73+zqVUWhJPnpm5bnVzrsqu/mDo/EuClH9zp8oWz2RQfyCdVPtCwmY8wg/nrrUZNVV/AbgchuTedUHgs0IQ7eqUEZTVWrUFkkv82OvWUlu2RFxfFw4e9cTzEJJVPGxLmowFpFNKzp206jP3uL23VdnHrI8m4CGOqIlyfXgfCfIu/NxbLnzRnbQpQIDAQABAoIBAEvGXciy1olGKOpAVsJAfb3RfgO9+bOC2obdnbClcDz66ykYJmqY2hqTd7pW1Wx2DA21ochy4Y9Qi2n6D6le0ksQA+vmgUinHv43zikGzRrJGFKyWRyIySG8rWJZ1KB35+NaekvorZ9BDhPE5cH8sKcsCHOeYZFs3vQqJo6cjC2NwBSC+8HzeO+Btcgz88FX46tFvNokeGuJqZEEcfhss5dggEdHiUKTJsRXIdxwXqnYv08uPEzn/ogsnCBc5+ujwwds2qxiua599J8lY5KbB3/kBVqtea2MYUX/JUNEAIQRm7ygJ0DJJKRjPO0vYnkxXWC2waY5cRBpKQiTmJVwvf0CgYEA7xA8816Y42zRk5eU1ngmVX1GEoVkK6wf0obIgSMHlrwKl5u4rb3Vu8qGIPZ/OPw6zIr+sfAmsR2hFy6mAjQrLsGoGmegU1s6Ogr5fqMw55/OWv7tEhfI+myX2N9xw9IpodBsFfvd8yDDMmByiFtFx1oGu41VbbAJZdvsdlBIyV8CgYEA1hx5DspkRth44zIzgV+7EmCRSghCJ0c85MJwohpXX2wKg09gWm9AuuH74DEo0akIZGIRUZqxelMh3dc/mKmQmoMRbfMJojb7fytw3CtZEDNiXXDBtrZW2FFrwixK8XzFCKjYxwqOCt+kYbQcCz7MABWUb+heUxH+QMYtXTRr8HsCgYEAqup6GSktt5NKNvItmDQofABng8BYgJy716FDYogv2cWw8PmFTLonP+6ofJKfHJfAVhKdy4u9re1YCaHxUCwKH5CW5eHmjxHvDCZif/aedUsclpQh3EijCN9wpL4DsRPlben8DK+Y3EU1KSQpXnGa7s7fd2GxjQ1JesiEQ4Zcs5MCgYEAkdfpOgLw1TUk+xU58jkkMztmG/iOHzUuLGCp2jF5LH1ql9Ecv90iSWofaLHzrQSnu8D1LRHjLICuA+9X2YQ/BJCc8bjn6f/rxc7wXHiGfTuTGDTzLqL7evPTI/uJvP6RM/nXV5U/9fYqgYbux1YqHTCV4Lh2b71E5BhZ1DAeCjsCgYA5taKd1CCN1KyflOpiDJPskQSBdF9wO+P+dUdmFZDNccUFk2rNQ63idcH/n2L258Wf9SiI2dDjaaxUEetP3Ei75eHf4ixw22zlZ/kl+/BPWBdmTb+22xzoVMnt/ya/kvEC27/GAbrV4v+c5WFTs+ExWWkYbrpYJ6LnxAHiNf7/Uw==';
const CLIENT_PUBLIC_KEY_MD5_HEX = '3f17d36cec77e47f1d301c0cc41cd73f';

let serverPublicKeyCache = null;
let clientPrivateKeyCache = null;

function serverPublicKey() {
  if (!serverPublicKeyCache) {
    serverPublicKeyCache = crypto.createPublicKey({
      key: Buffer.from(SERVER_PUBLIC_KEY_BASE64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  }
  return serverPublicKeyCache;
}

function clientPrivateKey() {
  if (!clientPrivateKeyCache) {
    clientPrivateKeyCache = crypto.createPrivateKey({
      key: Buffer.from(CLIENT_PRIVATE_KEY_BASE64, 'base64'),
      format: 'der',
      type: 'pkcs1',
    });
  }
  return clientPrivateKeyCache;
}

function rsaKeyBytes(keyObject) {
  const details = keyObject.asymmetricKeyDetails;
  if (details && details.modulusLength) return details.modulusLength / 8;
  return FALLBACK_RSA_KEY_BYTES;
}

function rsaEncrypt(data) {
  const pub = serverPublicKey();
  const chunkSize = rsaKeyBytes(pub) - 11;
  const input = Buffer.from(data);
  const parts = [];
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    const chunk = input.subarray(offset, offset + chunkSize);
    parts.push(crypto.publicEncrypt(
      { key: pub, padding: crypto.constants.RSA_PKCS1_PADDING },
      chunk,
    ));
  }
  return Buffer.concat(parts);
}

function rsaDecrypt(data) {
  const priv = clientPrivateKey();
  const chunkSize = rsaKeyBytes(priv);
  const input = Buffer.from(data);
  const parts = [];
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    if (input.length - offset < chunkSize) {
      throw new Error(`link_connection.rsaDecrypt: chunk too small: ${input.length - offset}`);
    }
    const chunk = input.subarray(offset, offset + chunkSize);
    parts.push(crypto.privateDecrypt(
      { key: priv, padding: crypto.constants.RSA_PKCS1_PADDING },
      chunk,
    ));
  }
  return Buffer.concat(parts);
}

function writeVarInt(value) {
  let v = value >>> 0;
  const bytes = [];
  for (;;) {
    const b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) {
      bytes.push(b | 0x80);
    } else {
      bytes.push(b);
      break;
    }
  }
  return Buffer.from(bytes);
}

function readVarInt(data, offset = 0) {
  let x = 0;
  let s = 0;
  let size = offset;
  for (;;) {
    if (size >= data.length) {
      return { value: 0, size: size - offset, ok: false };
    }
    const b = data[size];
    size += 1;
    if (b < 0x80) {
      x |= (b & 0x7f) << s;
      return { value: x | 0, size: size - offset, ok: true };
    }
    x |= (b & 0x7f) << s;
    s += 7;
    if (s >= 35) {
      return { value: 0, size: size - offset, ok: false };
    }
  }
}

class LinkConnection {
  constructor(service, socket, entry) {
    this.service = service;
    this.socket = socket;
    this.entry = entry;

    this.cipherR1 = null;
    this.encrypt = null;
    this.decrypt = null;
    this.recvBuf = Buffer.alloc(0);
    this.handshakeBuf = Buffer.alloc(0);
    this.handshakeDone = false;

    this.messagesQueue = new AsyncQueue();
    this.commonPushQueue = new AsyncQueue({ capacity: 32, dropWhenFull: true });
    this.events = new EventEmitter();

    this.closed = false;
    this.online = false;
    this.lastError = null;
    this._intentionalClose = false;
    this._heartbeatTimer = null;
    this._sendChain = Promise.resolve();

    this._loginSettled = false;
    this._loginError = null;
    this._loginWaiters = [];

    this._onData = (chunk) => this._handleData(chunk);
    this._onError = (err) => this._setError(err);
    this._onClose = () => {
      if (!this._intentionalClose && !this.lastError) {
        this.lastError = new Error('link_connection: EOF');
      }
      this._closeInternal();
    };

    socket.on('data', this._onData);
    socket.on('error', this._onError);
    socket.on('close', this._onClose);

    this._startHeartbeat();

    try {
      this._sendHandshake();
    } catch (err) {
      this._setError(err);
    }
  }

  _sendHandshake() {
    this.cipherR1 = randomBytes(16);
    const encrypted = rsaEncrypt(this.cipherR1);
    const md5Bytes = hexDecode(CLIENT_PUBLIC_KEY_MD5_HEX);
    this.socket.write(Buffer.concat([encrypted, md5Bytes]));
  }

  _handleData(chunk) {
    if (this.closed) return;

    if (!this.handshakeDone) {
      this.handshakeBuf = this.handshakeBuf.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([this.handshakeBuf, chunk]);

      const keySize = rsaKeyBytes(clientPrivateKey());
      if (this.handshakeBuf.length < keySize) return;

      const cipher = Buffer.from(this.handshakeBuf.subarray(0, keySize));
      const rest = Buffer.from(this.handshakeBuf.subarray(keySize));
      this.handshakeBuf = Buffer.alloc(0);

      try {
        this._completeHandshake(cipher);
      } catch (err) {
        this._setError(err);
        return;
      }

      if (rest.length > 0) {
        this.recvBuf = Buffer.concat([this.recvBuf, rest]);
        try {
          this._processFrames();
        } catch (err) {
          this._setError(err);
        }
      }
      return;
    }

    this.recvBuf = this.recvBuf.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([this.recvBuf, chunk]);
    try {
      this._processFrames();
    } catch (err) {
      this._setError(err);
    }
  }

  _completeHandshake(payload) {
    let plain = rsaDecrypt(payload);
    let end = plain.length;
    while (end > 0 && plain[end - 1] === 0) end -= 1;
    plain = plain.subarray(0, end);
    if (plain.length !== 16) {
      throw new Error(`link_connection.handshake: unexpected cipherR2 length ${plain.length}`);
    }

    const encryptKey = Buffer.concat([this.cipherR1, plain]);
    const decryptKey = Buffer.concat([plain, this.cipherR1]);
    this.encrypt = newNeteaseChaCha(encryptKey);
    this.decrypt = newNeteaseChaCha(decryptKey);
    this.handshakeDone = true;

    this._sendLoginRequest().catch((err) => this._setError(err));
  }

  _processFrames() {
    for (;;) {
      const lengthInfo = readVarInt(this.recvBuf, 0);
      if (!lengthInfo.ok) return;
      const total = lengthInfo.size + lengthInfo.value;
      if (this.recvBuf.length < total) return;

      const body = Buffer.from(this.recvBuf.subarray(lengthInfo.size, total));
      this.recvBuf = this.recvBuf.subarray(total);

      const message = this._decodeMessage(body);
      this._dispatchMessage(message);
    }
  }

  _decodeMessage(body) {
    if (!this.decrypt) {
      throw new Error('link_connection.decodeMessage: decrypt engine not ready');
    }
    const plain = this.decrypt.process(body);

    const serverInfo = readVarInt(plain, 0);
    if (!serverInfo.ok) {
      throw new Error('link_connection.decodeMessage: invalid server id');
    }
    const off = serverInfo.size;
    if (plain.length < off + 2) {
      throw new Error('link_connection.decodeMessage: payload too short');
    }
    const flag = plain[off];
    const methodLen = plain[off + 1];
    const start = off + 2;
    const endPos = start + methodLen;
    if (endPos > plain.length) {
      throw new Error('link_connection.decodeMessage: invalid method length');
    }
    const method = plain.subarray(start, endPos).toString('utf8');
    const payload = Buffer.from(plain.subarray(endPos));
    const payloadText = payload.toString('utf8');
    let json = null;
    if (payloadText !== '') {
      try {
        json = JSON.parse(payloadText);
      } catch (err) {
        json = null;
      }
    }

    return {
      serverId: serverInfo.value,
      flag,
      method,
      payload,
      payloadText,
      json,
    };
  }

  _dispatchMessage(message) {
    if (message.method === 'LoginV2') {
      if (message.json === null) {
        this._settleLogin(new Error('link_connection.login: parse response failed'));
        return;
      }
      if (toInt(message.json.code) !== 0) {
        this._settleLogin(new Error(`link_connection.login: server returned code ${message.json.code}`));
        return;
      }
      this.online = true;
      this._settleLogin(null);
      return;
    }

    if (message.method === 'CommonPush' || message.method === 'RollingMsg') {
      if (message.json && typeof message.json === 'object') {
        const data = {
          ...message.json,
          method: message.method,
          serverId: message.serverId,
          server_id: message.serverId,
          raw: message.payloadText,
        };
        this.commonPushQueue.push(data);
        this._safeEmit('commonPush', data);
      }
    }

    this.messagesQueue.push(message);
    this._safeEmit('message', message);
  }

  _settleLogin(err) {
    if (this._loginSettled) return;
    this._loginSettled = true;
    this._loginError = err;
    for (const waiter of this._loginWaiters.splice(0)) {
      if (err) waiter.reject(err);
      else waiter.resolve();
    }
  }

  waitForLogin() {
    if (this._loginSettled) {
      return this._loginError ? Promise.reject(this._loginError) : Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._loginWaiters.push({ resolve, reject });
    });
  }

  async _sendLoginRequest() {
    const uid = this.service.client.getUserIdInt();
    const token = md5(this.service.client.userToken);
    if (token.length !== 16) {
      throw new Error(`link_connection.login: unexpected token length ${token.length}`);
    }

    const randBlock = randomBytes(16);
    const randEnc = aesEcbEncryptBlock(randBlock, token);
    const payload = {
      uid,
      s1: hexEncode(randBlock),
      s2: hexEncode(randEnc),
      is_zip: false,
    };
    await this._sendMessage(0, 'LoginV2', Buffer.from(JSON.stringify(payload), 'utf8'));
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (!this.handshakeDone || this.closed) return;
      this.socket.write(Buffer.from([0]), (err) => {
        if (err) this._setError(new Error(`link_connection.heartbeat: ${err.message}`));
      });
    }, HEARTBEAT_INTERVAL_MS);
    if (typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
  }

  /** 发送一条 Link 消息。 */
  async sendMessage(serverID, method, payload = Buffer.alloc(0)) {
    if (!this.handshakeDone) {
      throw new Error('link_connection.SendMessage: 连接尚未准备就绪');
    }
    return this._sendMessage(serverID, method, payload);
  }

  async _sendMessage(serverID, method, payload) {
    if (!this.encrypt) {
      throw new Error('link_connection.sendMessage: encrypt engine 未准备');
    }
    if (method.length > 255) {
      throw new Error('link_connection.sendMessage: method 长度超出 255');
    }
    const payloadBuf = payload ? Buffer.from(payload) : Buffer.alloc(0);
    const methodBuf = Buffer.from(method, 'utf8');

    const body = Buffer.concat([
      writeVarInt(serverID),
      Buffer.from([0x00, methodBuf.length]),
      methodBuf,
      payloadBuf,
    ]);

    const encrypted = this.encrypt.process(body);
    const frame = Buffer.concat([writeVarInt(encrypted.length), encrypted]);
    await this._sendRaw(frame);
  }

  _sendRaw(data) {
    if (!data || data.length === 0) return Promise.resolve();
    const task = this._sendChain.then(() => new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('link_connection: 连接已关闭'));
        return;
      }
      this.socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));
    this._sendChain = task.catch(() => undefined);
    return task;
  }

  /** 发送聊天相关请求。 */
  sendChatRequest(serverID, method, data) {
    let payload = Buffer.alloc(0);
    if (data && Object.keys(data).length > 0) {
      payload = Buffer.from(JSON.stringify(data), 'utf8');
    }
    return this.sendMessage(serverID, method, payload);
  }

  /** 在世界频道发送文本消息。 */
  async sendGlobalMessage(content) {
    if (!this.online) {
      throw new Error('link_connection.SendGlobalMessage: 连接未登录');
    }
    const msg = {
      type: 'text',
      quick: false,
      data: content,
      message_visibility: 0,
    };
    const req = {
      msg: JSON.stringify(msg),
      refer_message_id: '',
    };
    return this.sendChatRequest(CHAT_SERVER_ID, 'SendMessage', req);
  }

  /** 发送 GameStart。 */
  async sendGameStart(data) {
    if (!this.online) {
      throw new Error('link_connection.SendGameStart: 连接未登录');
    }
    const payload = data ?? { strict_mode: true };
    return this.sendMessage(0, 'GameStart', Buffer.from(JSON.stringify(payload), 'utf8'));
  }

  /** 发送 GameStop。 */
  async sendGameStop(data) {
    if (!this.online) {
      throw new Error('link_connection.SendGameStop: 连接未登录');
    }
    const payload = data ?? { strict_mode: true };
    return this.sendMessage(0, 'GameStop', Buffer.from(JSON.stringify(payload), 'utf8'));
  }

  sendChatOnline() {
    return this.sendChatRequest(CHAT_SERVER_ID, 'Online', null);
  }

  requestChatDumpState() {
    return this.sendChatRequest(0, 'DumpState', null);
  }

  requestChatConnectState() {
    return this.sendChatRequest(0, 'ConnectState', { server_id: CHAT_SERVER_ID });
  }

  fetchGlobalMessages(length) {
    const size = length > 0 ? length : 20;
    return this.sendChatRequest(CHAT_SERVER_ID, 'GetGlobalMessages', {
      data: { length: size },
      length: size,
    });
  }

  isOnline() {
    return this.online;
  }

  /** 原始消息队列。 */
  messages() {
    return this.messagesQueue;
  }

  /** 公共频道推送队列。 */
  commonPushMessages() {
    return this.commonPushQueue;
  }

  /** 注册消息回调。 */
  onMessage(callback) {
    this.events.on('message', callback);
    return () => this.events.off('message', callback);
  }

  /** 注册公共频道推送回调。 */
  onCommonPush(callback) {
    this.events.on('commonPush', callback);
    return () => this.events.off('commonPush', callback);
  }

  socketInstance() {
    return this.socket;
  }

  error() {
    return this.lastError;
  }

  _setError(err) {
    if (this.closed) return;
    if (!this.lastError) this.lastError = err;
    this.online = false;
    this._settleLogin(err);
    this._closeInternal();
    if (this.events.listenerCount('error') > 0) {
      this._safeEmit('error', err);
    }
  }

  _closeInternal() {
    if (this.closed) return;
    this.closed = true;
    this.online = false;
    this._settleLogin(this.lastError || new Error('link_connection: connection closed'));
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this.socket.removeListener('data', this._onData);
    this.socket.removeListener('close', this._onClose);
    // 保留 error 监听器，避免 socket 销毁后出现未处理的 'error' 事件。
    try {
      this.socket.destroy();
    } catch (err) {
      // 忽略
    }
    this.messagesQueue.close();
    this.commonPushQueue.close();
    this._safeEmit('close');
  }

  async close() {
    this._intentionalClose = true;
    this._closeInternal();
  }

  /** 隔离用户回调异常，避免回调抛错导致连接断开。 */
  _safeEmit(eventName, payload) {
    try {
      this.events.emit(eventName, payload);
    } catch (err) {
      if (this.events.listenerCount('callbackError') > 0) {
        try {
          this.events.emit('callbackError', err);
        } catch (ignored) {
          // 忽略 callbackError 监听器自身的异常
        }
      }
    }
  }

  // Go 风格别名
  SendMessage(serverID, method, payload) {
    return this.sendMessage(serverID, method, payload);
  }

  SendChatRequest(serverID, method, data) {
    return this.sendChatRequest(serverID, method, data);
  }

  SendGlobalMessage(content) {
    return this.sendGlobalMessage(content);
  }

  SendGameStart(data) {
    return this.sendGameStart(data);
  }

  SendGameStop(data) {
    return this.sendGameStop(data);
  }

  SendChatOnline() {
    return this.sendChatOnline();
  }

  RequestChatDumpState() {
    return this.requestChatDumpState();
  }

  RequestChatConnectState() {
    return this.requestChatConnectState();
  }

  FetchGlobalMessages(length) {
    return this.fetchGlobalMessages(length);
  }

  IsOnline() {
    return this.isOnline();
  }

  Messages() {
    return this.messages();
  }

  CommonPushMessages() {
    return this.commonPushMessages();
  }

  Err() {
    return this.error();
  }

  Close() {
    return this.close();
  }
}

module.exports = {
  LinkConnection,
  CHAT_SERVER_ID,
  HEARTBEAT_INTERVAL_MS,
  writeVarInt,
  readVarInt,
  rsaEncrypt,
  rsaDecrypt,
  serverPublicKey,
  clientPrivateKey,
};
