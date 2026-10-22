'use strict';

/**
 * 聊天服务器连接（对应 Go 版本 service/chat_connection/connection.go）。
 */

const { EventEmitter } = require('node:events');

const { randomBytes } = require('../../utils/bytes');
const { aesEcbEncryptBlock } = require('../../utils/aes');
const { newNeteaseChaCha } = require('../../utils/chacha8');
const { AsyncQueue } = require('../../utils/async');
const { decodeToken } = require('./token');
const {
  HANDSHAKE_REQUEST_CMD,
  HEARTBEAT_INTERVAL_MS,
  emptyFrame,
  wrapFrame,
  FrameReader,
} = require('./define');
const {
  CommandChatPrivate,
  CommandChatGroup,
} = require('./chat_const');

class ChatConnection {
  constructor(service, socket, entry) {
    this.service = service;
    this.socket = socket;
    this.entry = entry;
    this.reader = new FrameReader(socket);

    this.encrypt = null;
    this.decrypt = null;
    this.seq = 0;
    this.lastError = null;
    this.online = false;
    this.closed = false;

    this.messagesQueue = new AsyncQueue();
    this.events = new EventEmitter();
    this._sendChain = Promise.resolve();
    this._heartbeatTimer = null;
  }

  /** 执行握手；成功后创建加解密引擎。 */
  async handshake() {
    const tokenBytes = decodeToken(this.service.client.userToken);
    const uid = this.service.client.getUserIdInt();
    if (uid < 0 || uid > 0xffffffff) {
      throw new Error(`chat_connection.handshake: 用户 ID 超出 32 位整数范围: ${uid}`);
    }

    const randBytes = randomBytes(16);
    const aesRand = aesEcbEncryptBlock(randBytes, tokenBytes);

    const head = Buffer.alloc(2);
    head.writeUInt16LE(1, 0);

    const body = Buffer.alloc(2 + 16 + 16 + 4);
    body.writeUInt16LE(HANDSHAKE_REQUEST_CMD, 0);
    randBytes.copy(body, 2);
    aesRand.copy(body, 18);
    body.writeUInt32LE(uid, 34);

    const framed = wrapFrame(Buffer.concat([head, body]));
    await this._write(framed);

    for (;;) {
      const frame = await this.reader.readFrame();
      if (frame === null) {
        throw new Error('chat_connection.handshake: 连接已关闭');
      }
      if (frame.length === 0) continue;
      if (frame.length < 5) {
        throw new Error(`chat_connection.handshake: 握手响应过短: ${frame.length}`);
      }
      const ret = frame[4];
      if (ret !== 0) {
        throw new Error(`chat_connection.handshake: 服务器返回错误码 ${ret}`);
      }
      break;
    }

    const encryptKey = Buffer.concat([tokenBytes, randBytes]);
    const decryptKey = Buffer.concat([randBytes, tokenBytes]);
    this.encrypt = newNeteaseChaCha(encryptKey);
    this.decrypt = newNeteaseChaCha(decryptKey);
    this.seq = 2;
    this.online = true;
    return this;
  }

  /** 启动读循环与心跳循环。 */
  startLoops() {
    this._startReadLoop();
    this._startHeartbeat();
  }

  _startReadLoop() {
    (async () => {
      try {
        for (;;) {
          const frame = await this.reader.readFrame();
          if (frame === null) {
            // 服务端正常关闭时也进入关闭态，立即停止心跳并记录错误。
            if (!this.closed) {
              this._setError(new Error('chat_connection: EOF'));
            }
            break;
          }
          if (frame.length === 0) continue;
          if (frame.length < 2) {
            throw new Error(`chat_connection: 收到异常帧长度 ${frame.length}`);
          }
          const seq = frame.readUInt16LE(0);
          const encrypted = frame.subarray(2);
          const plain = this.decrypt.process(encrypted);
          if (plain.length < 2) continue;
          const command = plain.readUInt16LE(0);
          const payload = Buffer.from(plain.subarray(2));
          const message = { sequence: seq, command, payload };

          this.messagesQueue.push(message);
          this._safeEmit('message', message);
        }
      } catch (err) {
        this._setError(err);
      } finally {
        this.online = false;
        this.messagesQueue.close();
        this._safeEmit('close');
      }
    })();
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      this._sendRaw(emptyFrame).catch((err) => {
        this._setError(new Error(`chat_connection: 心跳发送失败: ${err.message}`));
      });
    }, HEARTBEAT_INTERVAL_MS);
    if (typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
  }

  /** 发送私聊消息。 */
  async chatTo(uid, words) {
    const payload = Buffer.from(JSON.stringify([uid, words]), 'utf8');
    return this.sendCommand(CommandChatPrivate, payload);
  }

  /** 发送群聊消息。 */
  async groupChatTo(groupID, words) {
    const payload = Buffer.from(JSON.stringify([groupID, words]), 'utf8');
    return this.sendCommand(CommandChatGroup, payload);
  }

  _nextSeq() {
    let seq = this.seq;
    if (seq === 0) seq = 1;
    this.seq = (this.seq + 1) & 0xffff;
    return seq;
  }

  /** 发送一条聊天命令，返回使用的序列号。 */
  async sendCommand(command, payload) {
    if (!this.encrypt) {
      throw new Error('chat_connection.sendMessage: 连接未就绪');
    }
    const body = Buffer.alloc(2 + payload.length);
    body.writeUInt16LE(command & 0xffff, 0);
    Buffer.from(payload).copy(body, 2);

    const seq = this._nextSeq();
    const encrypted = this.encrypt.process(body);
    const message = Buffer.alloc(2 + encrypted.length);
    message.writeUInt16LE(seq, 0);
    encrypted.copy(message, 2);

    await this._sendRaw(wrapFrame(message));
    return seq;
  }

  /** sendMessage 的别名，兼容 Go 命名。 */
  sendMessage(command, payload) {
    return this.sendCommand(command, payload);
  }

  _sendRaw(data) {
    if (!data || data.length === 0) return Promise.resolve();
    const task = this._sendChain.then(() => this._write(data));
    this._sendChain = task.catch(() => undefined);
    return task;
  }

  _write(data) {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('chat_connection: 连接已关闭'));
        return;
      }
      this.socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** 当前是否已登录。 */
  isOnline() {
    return this.online;
  }

  /** 当前序列号。 */
  serialNumber() {
    return this.seq;
  }

  /** 返回消息异步队列，可用于 for await。 */
  messages() {
    return this.messagesQueue;
  }

  /** 注册消息回调，返回取消函数。 */
  onMessage(callback) {
    this.events.on('message', callback);
    return () => this.events.off('message', callback);
  }

  /** 最新错误。 */
  error() {
    return this.lastError;
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

  _setError(err) {
    if (!this.lastError) this.lastError = err;
    this.online = false;
    this.close().catch(() => undefined);
    if (this.events.listenerCount('error') > 0) {
      this._safeEmit('error', err);
    }
  }

  /** 关闭连接。 */
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.online = false;
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    this.reader.destroy();
    try {
      this.socket.destroy();
    } catch (err) {
      // 忽略销毁错误
    }
    this.messagesQueue.close();
  }

  // Go 风格别名
  ChatTo(uid, words) {
    return this.chatTo(uid, words);
  }

  GroupChatTo(groupID, words) {
    return this.groupChatTo(groupID, words);
  }

  SendCommand(command, payload) {
    return this.sendCommand(command, payload);
  }

  SendMessage(command, payload) {
    return this.sendCommand(command, payload);
  }

  IsOnline() {
    return this.isOnline();
  }

  SerialNumber() {
    return this.serialNumber();
  }

  Messages() {
    return this.messages();
  }

  Err() {
    return this.error();
  }

  Close() {
    return this.close();
  }
}

module.exports = {
  ChatConnection,
};
