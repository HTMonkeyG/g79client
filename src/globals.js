"use strict";

/**
 * Global configuration cache (mirrors the init logic in Go globals.go / client_core.go).
 *
 * All network requests use node:http(s); concurrent calls share one in-flight Promise
 * to avoid duplicate downloads.
 */

const { httpRequest, defaultInsecureTLS } = require("./http_util.js");
const { readFirstFileFromZipData } = require("./utils/zip.js");
const { md5Hex } = require("./utils/bytes.js");
const runtime = require("./runtime.js");
const {
  g79BaseMCPHash,
} = require("./engine_consts.js");

const G79_PACK_LIST_URL = "https://g79.update.netease.com/pack_list/production/g79_packlist_2";
const G79_PATCH_LIST_URL = "https://g79.update.netease.com/patch_list/production/g79_rn_patchlist";
const G79_RELEASE_JSON_URL = "https://g79.update.netease.com/serverlist/adr_release.0.17.json";
const X19_RELEASE_JSON_URL = "https://x19.update.netease.com/serverlist/release.json";

const SERVER_LIST_HEADERS = {
  "User-Agent": "libhttpclient/1.0.0.0",
  "Accept-Encoding": "gzip",
  "content-type": "text/plain",
};

const caches = {
  patchMeta: null,
  g79ReleaseJSON: null,
  x19ReleaseJSON: null,
  chatServers: null,
  linkServers: null,
  transferServers: null,
  packList: null,
};

const inflight = {
  patchMeta: null,
  g79ReleaseJSON: null,
  x19ReleaseJSON: null,
  chatServers: null,
  linkServers: null,
  transferServers: null,
  packList: null,
};

// Cache generation numbers: prevent an older in-flight request from overwriting data from a recent Refresh.
const generation = {
  patchMeta: 0,
  g79ReleaseJSON: 0,
  x19ReleaseJSON: 0,
  chatServers: 0,
  linkServers: 0,
  transferServers: 0,
  packList: 0,
};

function cloneMap(src, cloneValue = (v) => ({ ...v })) {
  if (!src) return null;
  const dst = {};
  for (const [k, v] of Object.entries(src)) {
    dst[k] = cloneValue(v);
  }
  return dst;
}

function cloneList(src) {
  return src ? src.map((v) => ({ ...v })) : null;
}

/** Get and cache a value through a shared in-flight Promise. */
async function cacheGet(key, fetcher) {
  if (caches[key] !== null) return caches[key];
  if (inflight[key] === null) {
    const startGeneration = generation[key];
    inflight[key] = fetcher()
      .then((value) => {
        if (generation[key] === startGeneration) {
          caches[key] = value;
        }
        return value;
      })
      .finally(() => {
        inflight[key] = null;
      });
  }
  return inflight[key];
}

async function cacheRefresh(key, fetcher) {
  const value = await fetcher();
  generation[key] += 1;
  caches[key] = value;
  return value;
}

// ---------------------------------------------------------------------------
// Common request utilities
// ---------------------------------------------------------------------------

async function fetchJSON(url, options = {}) {
  const res = await httpRequest(url, {
    insecureTLS: defaultInsecureTLS(),
    ...options,
  });
  const text = res.body.toString("utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`解析 JSON 失败 (${url}): ${err.message}`);
  }
}

async function downloadBytes(url, options = {}) {
  const res = await httpRequest(url, {
    insecureTLS: defaultInsecureTLS(),
    ...options,
  });
  if (res.statusCode !== 200) {
    throw new Error(`download ${url} returned status ${res.statusCode}`);
  }
  return res.body;
}

async function fetchFirstZipEntry(url) {
  return readFirstFileFromZipData(await downloadBytes(url));
}

// ---------------------------------------------------------------------------
// Data normalization
// ---------------------------------------------------------------------------

function normalizeChatServer(raw) {
  return {
    ip: raw.IP ?? "",
    ispEnabled: raw.Isp_Enabled ?? "",
    ctccHost: raw.ctcc_host ?? "",
    cmccHost: raw.cmcc_host ?? "",
    cuccHost: raw.cucc_host ?? "",
    port: raw.Port ?? 0,
    raw,
  };
}

function normalizeLinkServer(raw) {
  return {
    status: raw.status ?? "",
    ispEnabled: raw.Isp_Enabled ?? "",
    ip: raw.ip ?? "",
    serverType: raw.ServerType ?? "",
    id: raw.id ?? "",
    port: raw.port ?? "",
    raw,
  };
}

function normalizeTransferServer(raw) {
  return {
    status: raw.status ?? "",
    ip: raw.ip ?? "",
    ispEnabled: raw.Isp_Enabled ?? "",
    batchNew: raw.batchNew ?? "",
    batch: raw.batch ?? "",
    id: raw.id ?? "",
    signalWebPort: raw.SignalWebPort ?? "",
    serverType: raw.ServerType ?? "",
    webPort: raw.WebPort ?? "",
    ports: Array.isArray(raw.ports) ? raw.ports.slice() : [],
    raw,
  };
}

function normalizePackListEntry(raw) {
  return {
    url: raw.url ?? "",
    text: raw.text ?? "",
    version: raw.version ?? "",
    minVer: raw.min_ver ?? "",
    raw,
  };
}

function normalizeG79ReleaseJSON(raw) {
  return {
    coreServerUrl: raw.CoreServerUrl ?? "",
    authServerUrl: raw.AuthServerUrl ?? "",
    webServerUrl: raw.WebServerUrl ?? "",
    apiGatewayUrl: raw.ApiGatewayUrl ?? "",
    transferServerUrl: raw.TransferServerUrl ?? "",
    transferServerNewHttpUrl: raw.TransferServerNewHttpUrl ?? "",
    chatServerUrl: raw.ChatServerUrl ?? "",
    linkServerUrl: raw.LinkServerUrl ?? "",
    raw,
  };
}

function normalizeX19ReleaseJSON(raw) {
  return {
    coreServerUrl: raw.CoreServerUrl ?? "",
    webServerUrl: raw.WebServerUrl ?? "",
    webServerGrayUrl: raw.WebServerGrayUrl ?? "",
    transferServerUrl: raw.TransferServerUrl ?? "",
    transferServerHttpUrl: raw.TransferServerHttpUrl ?? "",
    peTransferServerUrl: raw.PeTransferServerUrl ?? "",
    peTransferServerHttpUrl: raw.PeTransferServerHttpUrl ?? "",
    peTransferServerNewHttpUrl: raw.PeTransferServerNewHttpUrl ?? "",
    authServerUrl: raw.AuthServerUrl ?? "",
    authServerCppUrl: raw.AuthServerCppUrl ?? "",
    chatServerUrl: raw.ChatServerUrl ?? "",
    apiGatewayUrl: raw.ApiGatewayUrl ?? "",
    apiGatewayGrayUrl: raw.ApiGatewayGrayUrl ?? "",
    dcWebUrl: raw.DCWebUrl ?? "",
    rentalTransferUrl: raw.RentalTransferUrl ?? "",
    raw,
  };
}

// ---------------------------------------------------------------------------
// Patch metadata
// ---------------------------------------------------------------------------

async function fetchG79PatchMetadata() {
  const patchInfo = await fetchJSON(G79_PATCH_LIST_URL);
  const versions = Array.isArray(patchInfo.android) ? patchInfo.android : [];
  const version = selectAndroidPatchVersion(versions);
  const resourcesHash = await fetchAndroidResourcesHash(version, patchInfo.urlNew || "");
  return { version, resourcesHash };
}

function getEngineBasePrefix() {
  const parts = String(runtime.getEngineVersion()).split(".");
  if (parts.length < 2) {
    throw new Error(`invalid engine version "${runtime.getEngineVersion()}"`);
  }
  return `${parts[0]}.${parts[1]}`;
}

function selectAndroidPatchVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("no android patch versions available");
  }
  const base = getEngineBasePrefix();
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    if (String(versions[i]).startsWith(base)) {
      return versions[i];
    }
  }
  throw new Error(`no android patch version matches base prefix ${base}`);
}

async function fetchAndroidResourcesHash(version, baseURL) {
  if (!baseURL) {
    throw new Error("empty patch base url");
  }
  const root = String(baseURL).replace(/\/+$/, "");
  const pre = `${root}/android_${version}/${version}/android`;

  const manifest = await fetchFirstZipEntry(`${pre}/manifest.zip`);
  let manifestPayload;
  try {
    manifestPayload = JSON.parse(manifest.toString("utf8"));
  } catch (err) {
    throw new Error(`解析 manifest 失败: ${err.message}`);
  }

  let hashBase = g79BaseMCPHash;
  const assets = manifestPayload.assets || {};
  if (assets["vanilla.mcp"] && assets["vanilla.mcp"].md5) {
    hashBase = assets["vanilla.mcp"].md5;
  }
  if (assets["vanilla_patch.mcp"] && assets["vanilla_patch.mcp"].md5) {
    hashBase += assets["vanilla_patch.mcp"].md5;
  }

  let rnHash = "";
  try {
    const raw = await downloadBytes(`${pre}/rn/index.bundle.backup`);
    let payload = raw;
    try {
      payload = readFirstFileFromZipData(raw);
    } catch (err) {
      // 不是 zip 时直接使用原始内容。
    }
    rnHash = md5Hex(payload);
  } catch (err) {
    // 与 Go 版本一致：下载失败时 rnHash 保持为空。
  }

  return md5Hex(`${hashBase}${rnHash}`);
}

async function getGlobalG79PatchMetadata() {
  const meta = await cacheGet("patchMeta", fetchG79PatchMetadata);
  return { ...meta };
}

async function refreshG79PatchMetadata() {
  const meta = await cacheRefresh("patchMeta", fetchG79PatchMetadata);
  return { ...meta };
}

async function getGlobalG79LatestVersion() {
  return (await getGlobalG79PatchMetadata()).version;
}

async function refreshG79LatestVersion() {
  return (await refreshG79PatchMetadata()).version;
}

// ---------------------------------------------------------------------------
// Release JSON
// ---------------------------------------------------------------------------

async function fetchG79ReleaseJSON() {
  return normalizeG79ReleaseJSON(await fetchJSON(G79_RELEASE_JSON_URL));
}

async function fetchX19ReleaseJSON() {
  return normalizeX19ReleaseJSON(await fetchJSON(X19_RELEASE_JSON_URL));
}

async function getGlobalG79ReleaseJSON() {
  return { ...(await cacheGet("g79ReleaseJSON", fetchG79ReleaseJSON)) };
}

async function refreshG79ReleaseJSON() {
  return { ...(await cacheRefresh("g79ReleaseJSON", fetchG79ReleaseJSON)) };
}

async function getGlobalX19ReleaseJSON() {
  return { ...(await cacheGet("x19ReleaseJSON", fetchX19ReleaseJSON)) };
}

async function refreshX19ReleaseJSON() {
  return { ...(await cacheRefresh("x19ReleaseJSON", fetchX19ReleaseJSON)) };
}

// ---------------------------------------------------------------------------
// Server lists
// ---------------------------------------------------------------------------

async function fetchServerList(url, normalizer) {
  const list = await fetchJSON(url, { headers: { ...SERVER_LIST_HEADERS } });
  if (!Array.isArray(list)) {
    throw new Error("服务器列表格式错误");
  }
  return list.map(normalizer);
}

async function fetchG79ChatServers() {
  const release = await getGlobalG79ReleaseJSON();
  return fetchServerList(release.chatServerUrl, normalizeChatServer);
}

async function fetchG79LinkServers() {
  const release = await getGlobalG79ReleaseJSON();
  return fetchServerList(release.linkServerUrl, normalizeLinkServer);
}

async function fetchG79TransferServers() {
  const release = await getGlobalG79ReleaseJSON();
  return fetchServerList(release.transferServerUrl, normalizeTransferServer);
}

async function getGlobalG79ChatServers() {
  return cloneList(await cacheGet("chatServers", fetchG79ChatServers));
}

async function refreshG79ChatServers() {
  return cloneList(await cacheRefresh("chatServers", fetchG79ChatServers));
}

async function getGlobalG79LinkServers() {
  return cloneList(await cacheGet("linkServers", fetchG79LinkServers));
}

async function refreshG79LinkServers() {
  return cloneList(await cacheRefresh("linkServers", fetchG79LinkServers));
}

async function getGlobalG79TransferServers() {
  return cloneList(await cacheGet("transferServers", fetchG79TransferServers));
}

async function refreshG79TransferServers() {
  return cloneList(await cacheRefresh("transferServers", fetchG79TransferServers));
}

// ---------------------------------------------------------------------------
// Pack List
// ---------------------------------------------------------------------------

async function fetchG79PackList() {
  const raw = await fetchJSON(G79_PACK_LIST_URL, {
    headers: {
      ...SERVER_LIST_HEADERS,
      "cache-control": "no-cache",
    },
  });
  const result = {};
  for (const [key, value] of Object.entries(raw || {})) {
    result[key] = normalizePackListEntry(value || {});
  }
  return result;
}

async function getGlobalG79PackList() {
  return cloneMap(await cacheGet("packList", fetchG79PackList));
}

async function refreshG79PackList() {
  return cloneMap(await cacheRefresh("packList", fetchG79PackList));
}

/** Clear all caches (mainly for tests). */
function resetGlobals() {
  for (const key of Object.keys(caches)) {
    caches[key] = null;
    generation[key] = 0;
    inflight[key] = null;
  }
}

module.exports = {
  G79_PACK_LIST_URL,
  G79_PATCH_LIST_URL,
  G79_RELEASE_JSON_URL,
  X19_RELEASE_JSON_URL,
  fetchG79PatchMetadata,
  fetchG79ReleaseJSON,
  fetchX19ReleaseJSON,
  getGlobalG79PatchMetadata,
  refreshG79PatchMetadata,
  getGlobalG79LatestVersion,
  refreshG79LatestVersion,
  getGlobalG79ReleaseJSON,
  refreshG79ReleaseJSON,
  getGlobalX19ReleaseJSON,
  refreshX19ReleaseJSON,
  getGlobalG79ChatServers,
  refreshG79ChatServers,
  getGlobalG79LinkServers,
  refreshG79LinkServers,
  getGlobalG79TransferServers,
  refreshG79TransferServers,
  getGlobalG79PackList,
  refreshG79PackList,
  resetGlobals,
  downloadBytes,
  fetchFirstZipEntry,
  readFirstFileFromZipData,
  normalizeChatServer,
  normalizeLinkServer,
  normalizeTransferServer,
  normalizePackListEntry,
  normalizeG79ReleaseJSON,
  normalizeX19ReleaseJSON,
  selectAndroidPatchVersion,
  // Go-style aliases
  GetGlobalG79PatchMetadata: getGlobalG79PatchMetadata,
  RefreshG79PatchMetadata: refreshG79PatchMetadata,
  GetGlobalG79LatestVersion: getGlobalG79LatestVersion,
  RefreshG79LatestVersion: refreshG79LatestVersion,
  GetGlobalG79ReleaseJSON: getGlobalG79ReleaseJSON,
  RefreshG79ReleaseJSON: refreshG79ReleaseJSON,
  GetGlobalX19ReleaseJSON: getGlobalX19ReleaseJSON,
  RefreshX19ReleaseJSON: refreshX19ReleaseJSON,
  GetGlobalG79ChatServers: getGlobalG79ChatServers,
  RefreshG79ChatServers: refreshG79ChatServers,
  GetGlobalG79LinkServers: getGlobalG79LinkServers,
  RefreshG79LinkServers: refreshG79LinkServers,
  GetGlobalG79TransferServers: getGlobalG79TransferServers,
  RefreshG79TransferServers: refreshG79TransferServers,
  GetGlobalG79PackList: getGlobalG79PackList,
  RefreshG79PackList: refreshG79PackList,
};
