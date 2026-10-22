'use strict';

/**
 * Client 核心（对应 Go 版本 client_core.go）。
 */

const { HttpClient } = require('./http_util');
const globals = require('./globals');
const runtime = require('./runtime');

class Client {
  constructor(options = {}) {
    this.userId = options.userId ?? '';
    this.userToken = options.userToken ?? '';
    this.seed = options.seed ?? '';

    this.releaseJSON = options.releaseJSON ? { ...options.releaseJSON } : {};
    this.x19ReleaseJSON = options.x19ReleaseJSON ? { ...options.x19ReleaseJSON } : {};

    this.engineVersion = options.engineVersion ?? runtime.getEngineVersion();
    this.g79LatestVersion = options.g79LatestVersion ?? '';
    this.patchResourcesHash = options.patchResourcesHash ?? '';

    this.userDetail = options.userDetail ?? null;
    this.peUserLoginAfter = null;
    this.cookie = '';

    // PE 认证签名的 (sp, tr) 参数。默认沿用 Go 版本的 (2, 9)；
    // 不同客户端版本的样本可能使用不同参数，可按需覆盖。
    this.peAuthSignParams = options.peAuthSignParams ?? [2, 9];

    this.httpClient = options.httpClient || new HttpClient({
      timeoutMs: options.requestTimeoutMs,
      insecureTLS: options.insecureTLS,
    });
  }

  /** 发起 HTTP 请求（供各 API 模块复用）。 */
  request(url, options = {}) {
    return this.httpClient.request(url, options);
  }

  /** 设置用户凭证。 */
  setCredentials(userId, userToken) {
    this.userId = String(userId ?? '');
    this.userToken = String(userToken ?? '');
  }

  /** 将 userId 解析为安全整数。 */
  getUserIdInt() {
    const value = String(this.userId ?? '');
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
 * 创建客户端并拉取补丁信息与 release 配置。
 *
 * @param {object} [options]
 * @param {boolean} [options.skipBootstrap] 为 true 时不访问网络
 * @param {object} [options.patchMeta] 直接指定 { version, resourcesHash }
 * @param {object} [options.releaseJSON] 直接指定 G79 release 配置
 * @param {object} [options.x19ReleaseJSON] 直接指定 X19 release 配置
 * @param {number} [options.requestTimeoutMs]
 * @param {boolean} [options.insecureTLS]
 * @returns {Promise<Client>}
 */
async function newClient(options = {}) {
  const client = new Client(options);
  if (options.skipBootstrap) {
    if (options.patchMeta) {
      client.g79LatestVersion = options.patchMeta.version ?? '';
      client.patchResourcesHash = options.patchMeta.resourcesHash ?? '';
    }
    return client;
  }

  // Go 版本在包初始化时会先执行 Refetch()，从 pack list 更新引擎版本。
  // JS 版本在首次创建客户端时补上这一步，避免使用过期的默认版本号。
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
      // 让补丁版本选择逻辑使用指定的引擎版本，并绕过可能来自其他版本的缓存。
      runtime.setEngineVersion(options.engineVersion);
      meta = await globals.refreshG79PatchMetadata();
    } else {
      meta = await globals.getGlobalG79PatchMetadata();
    }
  }
  client.g79LatestVersion = meta.version ?? '';
  client.patchResourcesHash = meta.resourcesHash ?? '';

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

  // 对应 Go 包 init 中每 60 秒执行一次 Refetch 的 goroutine。
  if (options.autoRefresh !== false) {
    startAutoRefresh(options.autoRefreshIntervalMs ?? 60_000);
  }

  return client;
}

/**
 * 强制刷新全局配置（对应 Go 的 Refetch）。
 * Go 版本在包 init 中立即调用一次；JS 版本在 NewClient 中按需执行，
 * 避免 import 阶段发起网络请求。
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
 * 启动后台配置刷新（默认 60 秒），对应 Go 包 init 中的定时 Refetch。
 * 定时器会 unref，不会阻止 Node 进程退出。
 */
function startAutoRefresh(intervalMs = 60_000) {
  if (autoRefreshTimer) return autoRefreshTimer;
  autoRefreshTimer = setInterval(() => {
    refetch().catch(() => undefined);
  }, intervalMs);
  if (typeof autoRefreshTimer.unref === 'function') {
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
