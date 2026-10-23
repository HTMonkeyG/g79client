"use strict";

/**
 * Link server list and connection management (mirrors Go service/link_connection/service.go).
 */

const net = require("node:net");
const crypto = require("node:crypto");

const globals = require("../../globals.js");
const { toInt } = require("../../types.js");
const { withTimeout, waitForEvent } = require("../../utils/async.js");
const { LinkConnection } = require("./connection.js");

function cloneServers(servers) {
  return servers ? servers.map((entry) => ({ ...entry })) : [];
}

class LinkConnectionService {
  constructor(client) {
    if (!client) {
      throw new Error("link_connection.NewLinkConnectionService: client 不能为空");
    }
    this.client = client;
    this.serversCache = null;
    this.primeError = null;
  }

  /** Create the service and prefetch the server list (still returns an instance on failure). */
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
    // Same as Go: an empty list is not cached, so the next call will fetch again.
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

  /** Randomly select an available node. */
  async selectEndpoint() {
    const servers = await this.servers();
    if (servers.length === 0) {
      throw new Error("link_connection.SelectEndpoint: 当前没有可用的 link 服务器");
    }
    const entry = servers[crypto.randomInt(servers.length)];
    return { entry };
  }

  /** Select a node and establish a connection (waits for login). */
  async dial(options = {}) {
    const endpoint = await this.selectEndpoint();
    return this.dialEndpoint(endpoint, options);
  }

  /** Establish a connection using the specified node. */
  async dialEndpoint(endpoint, options = {}) {
    if (!endpoint) {
      throw new Error("link_connection.DialEndpoint: endpoint 不能为空");
    }
    const entry = endpoint.entry;
    const port = toInt(entry.port);
    if (port === 0) {
      throw new Error("link_connection.DialEndpoint: 节点端口无效");
    }
    const timeoutMs = options.timeoutMs ?? 30000;
    const signal = options.signal ?? null;

    const socket = net.connect({ host: entry.ip, port });
    try {
      await withTimeout(
        waitForEvent(socket, "connect", ["error", "close"]),
        timeoutMs,
        signal,
        "link_connection: 连接超时",
      );
    } catch (err) {
      socket.destroy();
      throw err;
    }

    const conn = new LinkConnection(this, socket, entry);
    try {
      const loginPromise = conn.waitForLogin();
      loginPromise.catch(() => undefined);
      await withTimeout(loginPromise, timeoutMs, signal, "link_connection: 登录超时");
    } catch (err) {
      await conn.close();
      throw err;
    }
    return conn;
  }

  // Go-style aliases
  Client() { return this.clientInstance(); }
  Servers() { return this.servers(); }
  RefreshServers() { return this.refreshServers(); }
  SelectEndpoint() { return this.selectEndpoint(); }
  Dial(options = {}) { return this.dial(options); }
  DialEndpoint(endpoint, options = {}) { return this.dialEndpoint(endpoint, options); }
}

/** Factory function. */
async function newLinkConnectionService(client) {
  return LinkConnectionService.create(client);
}

module.exports = {
  LinkConnectionService,
  newLinkConnectionService,
  NewLinkConnectionService: newLinkConnectionService,
};
