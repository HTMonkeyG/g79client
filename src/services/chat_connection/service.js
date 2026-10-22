'use strict';

/**
 * 聊天服务器列表与连接管理（对应 Go 版本 service/chat_connection/service.go）。
 */

const net = require('node:net');
const crypto = require('node:crypto');

const globals = require('../../globals');
const { toBool } = require('../../types');
const { withTimeout, waitForEvent } = require('../../utils/async');
const { ChatConnection } = require('./connection');

const ISP_HOST_KEYS = {
  10000: 'ctccHost',
  10010: 'cuccHost',
  10086: 'cmccHost',
  0: 'ip',
};

function cloneServers(servers) {
  return servers ? servers.map((entry) => ({ ...entry })) : [];
}

class ChatConnectionService {
  constructor(client) {
    if (!client) {
      throw new Error('chat_connection.NewChatConnectionService: client 不能为空');
    }
    this.client = client;
    this.serversCache = null;
    this.primeError = null;
  }

  /**
   * 创建服务并预取服务器列表。
   * 与 Go 版本一致：预取失败时仍返回服务实例，错误记录在 primeError。
   */
  static async create(client) {
    const svc = new ChatConnectionService(client);
    try {
      await svc.primeServers();
    } catch (err) {
      svc.primeError = err;
    }
    return svc;
  }

  async primeServers() {
    const list = await globals.getGlobalG79ChatServers();
    // 与 Go 一致：空列表不进入缓存，下次调用会重新拉取。
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  /** 底层 G79 客户端。 */
  clientInstance() {
    return this.client;
  }

  /** 当前服务器列表；缓存为空时自动刷新。 */
  async servers() {
    if (this.serversCache !== null) return cloneServers(this.serversCache);
    return this.refreshServers();
  }

  /** 强制刷新服务器列表。 */
  async refreshServers() {
    const list = await globals.refreshG79ChatServers();
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  /** 根据 ISP ID 随机选择一个聊天服务器。 */
  async selectServer(ispID = 0) {
    const servers = await this.servers();
    if (servers.length === 0) {
      throw new Error('chat_connection.SelectServer: 当前没有可用的聊天服务器');
    }
    const entry = servers[crypto.randomInt(servers.length)];
    const host = resolveHostByISP(entry, ispID);
    if (host === '') {
      throw new Error('chat_connection.SelectServer: 找不到有效域名');
    }
    return {
      host,
      port: Number(entry.port) || 0,
      entry,
    };
  }

  /** 选择服务器并建立连接。 */
  async dial(options = {}) {
    const endpoint = await this.selectServer(options.ispId ?? 0);
    return this.dialWithEndpoint(endpoint, options);
  }

  /** 使用指定端点建立聊天连接。 */
  async dialWithEndpoint(endpoint, options = {}) {    if (!endpoint) {
      throw new Error('chat_connection.DialWithEndpoint: endpoint 不能为空');
    }
    const timeoutMs = options.timeoutMs ?? 10000;
    const signal = options.signal ?? null;

    if (!endpoint.port) {
      throw new Error('chat_connection.DialWithEndpoint: 端口无效');
    }

    const socket = net.connect({ host: endpoint.host, port: endpoint.port });

    try {
      await withTimeout(
        waitForEvent(socket, 'connect', ['error', 'close']),
        timeoutMs,
        signal,
        'chat_connection: 连接超时',
      );
    } catch (err) {
      socket.destroy();
      throw err;
    }

    const conn = new ChatConnection(this, socket, endpoint.entry);
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error('chat_connection.handshake: 握手超时'));
    });

    try {
      const handshakePromise = conn.handshake();
      // 防止超时竞速后出现未处理的 rejection
      handshakePromise.catch(() => undefined);
      await withTimeout(handshakePromise, timeoutMs, signal, 'chat_connection: 握手超时');
    } catch (err) {
      conn.close().catch(() => undefined);
      throw err;
    } finally {
      socket.setTimeout(0);
    }

    conn.startLoops();
    return conn;
  }

  // Go 风格别名
  Client() { return this.clientInstance(); }
  Servers() { return this.servers(); }
  RefreshServers() { return this.refreshServers(); }
  SelectServer(ispID = 0) { return this.selectServer(ispID); }
  Dial(options = {}) { return this.dial(options); }
  DialWithEndpoint(endpoint, options = {}) { return this.dialWithEndpoint(endpoint, options); }
}

/** 根据 ISP ID 解析服务器域名。 */
function resolveHostByISP(entry, ispID) {
  if (toBool(entry.ispEnabled)) {
    const key = ISP_HOST_KEYS[ispID];
    if (key && entry[key]) {
      return entry[key];
    }
  }
  if (entry.ip) return entry.ip;
  if (entry.ctccHost) return entry.ctccHost;
  if (entry.cmccHost) return entry.cmccHost;
  if (entry.cuccHost) return entry.cuccHost;
  return '';
}

/** 工厂函数（对应 Go 的 NewChatConnectionService）。 */
async function newChatConnectionService(client) {
  return ChatConnectionService.create(client);
}

module.exports = {
  ChatConnectionService,
  newChatConnectionService,
  NewChatConnectionService: newChatConnectionService,
  resolveHostByISP,
};
