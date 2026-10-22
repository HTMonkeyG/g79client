'use strict';

/**
 * HTTP 工具层。
 *
 * 使用 Node 自带的 http/https 模块（零依赖），并负责：
 * - gzip / deflate / br 响应解压
 * - 重定向跟随
 * - 超时与 AbortSignal
 * - 可选的不校验证书模式（仅用于本地抓包/自签名环境，通过环境变量开启）
 */

const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 10;

function envFlag(name) {
  const value = process.env[name];
  return value === '1' || value === 'true' || value === 'yes';
}

/** 是否关闭 TLS 证书校验（默认关闭）。 */
function defaultInsecureTLS() {
  return envFlag('G79_TLS_INSECURE');
}

function decompressBody(body, contentEncoding) {
  const enc = String(contentEncoding || '').toLowerCase();
  if (!enc || body.length === 0) return body;
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(body);
    if (enc.includes('deflate')) return zlib.inflateSync(body);
    if (enc.includes('br')) return zlib.brotliDecompressSync(body);
  } catch (err) {
    // 某些服务端会错误地声明编码，此时保留原始内容。
    return body;
  }
  return body;
}

function normalizeHeaderValue(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/**
 * 发起一次 HTTP 请求（不处理重定向）。
 * @returns {Promise<{statusCode:number, headers:Object, body:Buffer}>}
 */
function doRequest(urlObj, options) {
  return new Promise((resolve, reject) => {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      insecureTLS = defaultInsecureTLS(),
      signal = null,
    } = options;

    if (signal && signal.aborted) {
      reject(signal.reason || new Error('request aborted'));
      return;
    }

    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;

    const bodyBuffer = body === null || body === undefined ? null : Buffer.from(body);
    const finalHeaders = { ...headers };
    // Go 的 strings.Reader 会自动带上 Content-Length；这里显式设置，避免使用 chunked 编码。
    if (bodyBuffer && !hasHeader(finalHeaders, 'content-length') && !hasHeader(finalHeaders, 'transfer-encoding')) {
      finalHeaders['Content-Length'] = String(bodyBuffer.length);
    }

    const requestOptions = {
      method,
      headers: finalHeaders,
      timeout: timeoutMs,
    };
    if (isHttps && insecureTLS) {
      requestOptions.rejectUnauthorized = false;
    }

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      fn(value);
    };

    const req = mod.request(urlObj, requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', (err) => finish(reject, err));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const decoded = decompressBody(raw, res.headers['content-encoding']);
        finish(resolve, {
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: decoded,
        });
      });
    });

    function onAbort() {
      req.destroy(signal.reason || new Error('request aborted'));
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    req.on('timeout', () => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    });
    req.on('error', (err) => finish(reject, err));

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

/**
 * 发起 HTTP(S) 请求并跟随重定向。
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<{statusCode:number, headers:Object, body:Buffer, url:string}>}
 */
async function httpRequest(url, options = {}) {
  let current = new URL(url);
  let method = options.method || 'GET';
  let body = options.body;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const headers = { ...(options.headers || {}) };
    const res = await doRequest(current, { ...options, method, body, headers });

    const location = normalizeHeaderValue(res.headers.location);
    const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode) && location;
    if (!isRedirect) {
      return { ...res, url: current.toString() };
    }

    // 与 Go 的默认行为保持一致：301/302/303 在 POST 时改为 GET。
    if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      delete headers['content-type'];
      delete headers['Content-Type'];
      delete headers['content-length'];
      delete headers['Content-Length'];
    }
    current = new URL(location, current);
  }

  throw new Error(`too many redirects: ${url}`);
}

/** 读取响应体（当前实现已在 doRequest 中解压，这里保持接口兼容）。 */
function readResponseBody(response) {
  return Buffer.from(response.body);
}

/** 将响应体按 UTF-8 解码。 */
function responseText(response) {
  return Buffer.from(response.body).toString('utf8');
}

/** 带默认配置的 HTTP 客户端。 */
class HttpClient {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.insecureTLS = options.insecureTLS ?? defaultInsecureTLS();
  }

  request(url, options = {}) {
    return httpRequest(url, {
      timeoutMs: this.timeoutMs,
      insecureTLS: this.insecureTLS,
      ...options,
    });
  }

  async post(url, body, options = {}) {
    return this.request(url, {
      method: 'POST',
      body,
      ...options,
    });
  }

  async get(url, options = {}) {
    return this.request(url, { method: 'GET', ...options });
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  defaultInsecureTLS,
  decompressBody,
  httpRequest,
  readResponseBody,
  responseText,
  HttpClient,
};
