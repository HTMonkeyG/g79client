"use strict";

/**
 * Client core (mirrors Go client_core.go).
 */

const { HttpClient } = require("./http_util.js");
const globals = require("./globals.js");
const runtime = require("./runtime.js");

class Client {
  constructor(options = {}) {
    this.userId = options.userId ?? "";
    this.userToken = options.userToken ?? "";
    this.seed = options.seed ?? "";

    this.releaseJSON = options.releaseJSON ? { ...options.releaseJSON } : {};
    this.x19ReleaseJSON = options.x19ReleaseJSON ? { ...options.x19ReleaseJSON } : {};

    this.engineVersion = options.engineVersion ?? runtime.getEngineVersion();
    this.g79LatestVersion = options.g79LatestVersion ?? "";
    this.patchResourcesHash = options.patchResourcesHash ?? "";

    this.userDetail = options.userDetail ?? null;
    this.peUserLoginAfter = null;
    this.cookie = "";

    // PE auth signature (sp, tr) parameters. Defaults to (2, 9) from the Go version;
    // different client versions may use different values, so they can be overridden.
    this.peAuthSignParams = options.peAuthSignParams ?? [2, 9];

    this.httpClient = options.httpClient || new HttpClient({
      timeoutMs: options.requestTimeoutMs,
      insecureTLS: options.insecureTLS,
    });
  }

  /** Send an HTTP request (shared by API modules). */
  request(url, options = {}) {
    return this.httpClient.request(url, options);
  }

  /** Set user credentials. */
  setCredentials(userId, userToken) {
    this.userId = String(userId ?? "");
    this.userToken = String(userToken ?? "");
  }

  /** Parse userId as a safe integer. */
  getUserIdInt() {
    const value = String(this.userId ?? "");
    if (!/^[+-]?\d+$/.test(value)) {
      throw new Error(`strconv.ParseInt: parsing "${value}": invalid syntax`);
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`用户 ID 超出 JavaScript 安全整数范围: ${value}`);
    }
    return parsed;
  }
}

/**
 * Create a client and fetch patch information and release configuration.
 *
 * @param {object} [options]
 * @param {boolean} [options.skipBootstrap] When true, do not access the network
 * @param {object} [options.patchMeta] Explicitly provide { version, resourcesHash }
 * @param {object} [options.releaseJSON] Explicitly provide the G79 release config
 * @param {object} [options.x19ReleaseJSON] Explicitly provide the X19 release config
 * @param {number} [options.requestTimeoutMs]
 * @param {boolean} [options.insecureTLS]
 * @returns {Promise<Client>}
 */
async function newClient(options = {}) {
  const client = new Client(options);
  if (options.skipBootstrap) {
    if (options.patchMeta) {
      client.g79LatestVersion = options.patchMeta.version ?? "";
      client.patchResourcesHash = options.patchMeta.resourcesHash ?? "";
    }
    return client;
  }

  // Go runs Refetch() during package init to update the engine version from the pack list.
  // The JS version performs this step when the first client is created to avoid using a stale default version.
  if (options.engineVersion === undefined && runtime.getEngineVersion() === runtime.DEFAULT_ENGINE_VERSION) {
    try {
      const packList = await globals.refreshG79PackList();
      if (packList && packList.netease && packList.netease.version) {
        runtime.setEngineVersion(packList.netease.version);
        client.engineVersion = runtime.getEngineVersion();
      }
    } catch (err) {
      // pack list 获取失败时继续使用当前引擎版本。
    }
  }

  let meta = options.patchMeta;
  if (!meta) {
    if (options.engineVersion !== undefined) {
      // Make the patch version selection use the specified engine version and bypass a cache from another version.
      runtime.setEngineVersion(options.engineVersion);
      meta = await globals.refreshG79PatchMetadata();
    } else {
      meta = await globals.getGlobalG79PatchMetadata();
    }
  }
  client.g79LatestVersion = meta.version ?? "";
  client.patchResourcesHash = meta.resourcesHash ?? "";

  if (options.releaseJSON) {
    client.releaseJSON = { ...options.releaseJSON };
  } else {
    client.releaseJSON = await globals.getGlobalG79ReleaseJSON();
  }

  if (options.x19ReleaseJSON) {
    client.x19ReleaseJSON = { ...options.x19ReleaseJSON };
  } else {
    client.x19ReleaseJSON = await globals.getGlobalX19ReleaseJSON();
  }

  // Mirrors the Go package init goroutine that runs Refetch every 60 seconds.
  if (options.autoRefresh !== false) {
    startAutoRefresh(options.autoRefreshIntervalMs ?? 60_000);
  }

  return client;
}

/**
 * Force-refresh the global configuration (mirrors Go Refetch).
 * Go calls this once during package init; the JS version runs it on demand in NewClient
 * to avoid network requests during import.
 */
async function refetch() {
  try {
    const packList = await globals.refreshG79PackList();
    if (packList && packList.netease && packList.netease.version) {
      runtime.setEngineVersion(packList.netease.version);
    }
  } catch (err) {
    // 与 Go 版本一致：pack list 失败时继续尝试刷新其余配置。
  }
  await globals.refreshG79LatestVersion().catch(() => undefined);
  await globals.refreshG79ReleaseJSON().catch(() => undefined);
  await globals.refreshX19ReleaseJSON().catch(() => undefined);
  await globals.refreshG79ChatServers().catch(() => undefined);
  await globals.refreshG79LinkServers().catch(() => undefined);
  await globals.refreshG79TransferServers().catch(() => undefined);
}

let autoRefreshTimer = null;

/**
 * Start background configuration refresh (60 seconds by default), mirroring the periodic Refetch in Go package init.
 * The timer is unref'd so it will not keep the Node process alive.
 */
function startAutoRefresh(intervalMs = 60_000) {
  if (autoRefreshTimer) return autoRefreshTimer;
  autoRefreshTimer = setInterval(() => {
    refetch().catch(() => undefined);
  }, intervalMs);
  if (typeof autoRefreshTimer.unref === "function") {
    autoRefreshTimer.unref();
  }
  return autoRefreshTimer;
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

module.exports = {
  Client,
  NewClient: newClient,
  newClient,
  createClient: newClient,
  refetch,
  Refetch: refetch,
  startAutoRefresh,
  stopAutoRefresh,
};
