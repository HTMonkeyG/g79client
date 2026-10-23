"use strict";

/**
 * Chat server list and connection management (mirrors Go service/chat_connection/service.go).
 */

const net = require("node:net");
const crypto = require("node:crypto");

const globals = require("../../globals.js");
const { toBool } = require("../../types.js");
const { withTimeout, waitForEvent } = require("../../utils/async.js");
const { ChatConnection } = require("./connection.js");

const ISP_HOST_KEYS = {
  10000: "ctccHost",
  10010: "cuccHost",
  10086: "cmccHost",
  0: "ip",
};

function cloneServers(servers) {
  return servers ? servers.map((entry) => ({ ...entry })) : [];
}

class ChatConnectionService {
  constructor(client) {
    if (!client) {
      throw new Error("chat_connection.NewChatConnectionService: client 不能为空");
    }
    this.client = client;
    this.serversCache = null;
    this.primeError = null;
  }

  /**
   * Create the service and prefetch the server list.
   * Like the Go version, a prefetch failure still returns the service instance; the error is stored in primeError.
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
    // Same as Go: an empty list is not cached, so the next call will fetch again.
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  /** Underlying G79 client. */
  clientInstance() {
    return this.client;
  }

  /** Current server list; automatically refreshed when the cache is empty. */
  async servers() {
    if (this.serversCache !== null) return cloneServers(this.serversCache);
    return this.refreshServers();
  }

  /** Force-refresh the server list. */
  async refreshServers() {
    const list = await globals.refreshG79ChatServers();
    this.serversCache = list && list.length > 0 ? cloneServers(list) : null;
    return cloneServers(this.serversCache);
  }

  /** Randomly select a chat server based on the ISP ID. */
  async selectServer(ispID = 0) {
    const servers = await this.servers();
    if (servers.length === 0) {
      throw new Error("chat_connection.SelectServer: 当前没有可用的聊天服务器");
    }
    const entry = servers[crypto.randomInt(servers.length)];
    const host = resolveHostByISP(entry, ispID);
    if (host === "") {
      throw new Error("chat_connection.SelectServer: 找不到有效域名");
    }
    return {
      host,
      port: Number(entry.port) || 0,
      entry,
    };
  }

  /** Select a server and establish a connection. */
  async dial(options = {}) {
    const endpoint = await this.selectServer(options.ispId ?? 0);
    return this.dialWithEndpoint(endpoint, options);
  }

  /** Establish a chat connection using the specified endpoint. */
  async dialWithEndpoint(endpoint, options = {}) {    if (!endpoint) {
      throw new Error("chat_connection.DialWithEndpoint: endpoint 不能为空");
    }
    const timeoutMs = options.timeoutMs ?? 10000;
    const signal = options.signal ?? null;

    if (!endpoint.port) {
      throw new Error("chat_connection.DialWithEndpoint: 端口无效");
    }

    const socket = net.connect({ host: endpoint.host, port: endpoint.port });

    try {
      await withTimeout(
        waitForEvent(socket, "connect", ["error", "close"]),
        timeoutMs,
        signal,
        "chat_connection: 连接超时",
      );
    } catch (err) {
      socket.destroy();
      throw err;
    }

    const conn = new ChatConnection(this, socket, endpoint.entry);
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error("chat_connection.handshake: 握手超时"));
    });

    try {
      const handshakePromise = conn.handshake();
      // Prevent an unhandled rejection after a timeout race
      handshakePromise.catch(() => undefined);
      await withTimeout(handshakePromise, timeoutMs, signal, "chat_connection: 握手超时");
    } catch (err) {
      conn.close().catch(() => undefined);
      throw err;
    } finally {
      socket.setTimeout(0);
    }

    conn.startLoops();
    return conn;
  }

  // Go-style aliases
  Client() { return this.clientInstance(); }
  Servers() { return this.servers(); }
  RefreshServers() { return this.refreshServers(); }
  SelectServer(ispID = 0) { return this.selectServer(ispID); }
  Dial(options = {}) { return this.dial(options); }
  DialWithEndpoint(endpoint, options = {}) { return this.dialWithEndpoint(endpoint, options); }
}

/** Resolve the server hostname based on the ISP ID. */
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
  return "";
}

/** Factory function (mirrors Go NewChatConnectionService). */
async function newChatConnectionService(client) {
  return ChatConnectionService.create(client);
}

module.exports = {
  ChatConnectionService,
  newChatConnectionService,
  NewChatConnectionService: newChatConnectionService,
  resolveHostByISP,
};
