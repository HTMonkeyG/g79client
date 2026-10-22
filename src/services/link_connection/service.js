'use strict';

/**
 * Link 服务器列表与连接管理（对应 Go 版本 service/link_connection/service.go）。
 */

const net = require('node:net');
const crypto = require('node:crypto');

const globals = require('../../globals');
const { toInt } = require('../../types');
const { withTimeout, waitForEvent } = require('../../utils/async');
const { LinkConnection } = require('./connection');

function cloneServers(servers) {
  return servers ? servers.map((entry) => ({ ...entry })) : [];
}

class LinkConnectionService {
  constructor(client) {
    if (!client) {
      throw new Error('link_connection.NewLinkConnectionService: client 不能为空');
    }
    this.client = client;
    this.serversCache = null;
    this.primeError = null;
  }

  /** 创建服务并预取服务器列表（失败时仍返回实例）。 */
  static async create(client) {
    const svc = new LinkConnectionService(client);
    try {
      await svc.primeServers();
    } catch (err) {
      svc.primeError = err;
    }
    return svc;
  }

  async primeServers() {
    const list = await globals.getGlobalG79LinkServers();
    // 与 Go 一致：空列表不进入缓存，下次调用会重新拉取。
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  clientInstance() {
    return this.client;
  }

  async servers() {
    if (this.serversCache !== null) return cloneServers(this.serversCache);
    return this.refreshServers();
  }

  async refreshServers() {
    const list = await globals.refreshG79LinkServers();
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  /** 随机选择一个可用节点。 */
  async selectEndpoint() {
    const servers = await this.servers();
    if (servers.length === 0) {
      throw new Error('link_connection.SelectEndpoint: 当前没有可用的 link 服务器');
    }
    const entry = servers[crypto.randomInt(servers.length)];
    return { entry };
  }

  /** 选择节点并建立连接（等待登录完成）。 */
  async dial(options = {}) {
    const endpoint = await this.selectEndpoint();
    return this.dialEndpoint(endpoint, options);
  }

  /** 使用指定节点建立连接。 */
  async dialEndpoint(endpoint, options = {}) {
    if (!endpoint) {
      throw new Error('link_connection.DialEndpoint: endpoint 不能为空');
    }
    const entry = endpoint.entry;
    const port = toInt(entry.port);
    if (port === 0) {
      throw new Error('link_connection.DialEndpoint: 节点端口无效');
    }
    const timeoutMs = options.timeoutMs ?? 30000;
    const signal = options.signal ?? null;

    const socket = net.connect({ host: entry.ip, port });
    try {
      await withTimeout(
        waitForEvent(socket, 'connect', ['error', 'close']),
        timeoutMs,
        signal,
        'link_connection: 连接超时',
      );
    } catch (err) {
      socket.destroy();
      throw err;
    }

    const conn = new LinkConnection(this, socket, entry);
    try {
      const loginPromise = conn.waitForLogin();
      loginPromise.catch(() => undefined);
      await withTimeout(loginPromise, timeoutMs, signal, 'link_connection: 登录超时');
    } catch (err) {
      await conn.close();
      throw err;
    }
    return conn;
  }

  // Go 风格别名
  Client() { return this.clientInstance(); }
  Servers() { return this.servers(); }
  RefreshServers() { return this.refreshServers(); }
  SelectEndpoint() { return this.selectEndpoint(); }
  Dial(options = {}) { return this.dial(options); }
  DialEndpoint(endpoint, options = {}) { return this.dialEndpoint(endpoint, options); }
}

/** 工厂函数。 */
async function newLinkConnectionService(client) {
  return LinkConnectionService.create(client);
}

module.exports = {
  LinkConnectionService,
  newLinkConnectionService,
  NewLinkConnectionService: newLinkConnectionService,
};
