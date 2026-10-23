"use strict";

/**
 * HTTP utility layer.
 *
 * Uses Node's built-in http/https modules (zero dependencies) and handles:
 * - gzip / deflate / br response decompression
 * - redirect following
 * - timeouts and AbortSignal
 * - optional certificate verification bypass (for local capture/self-signed environments, enabled by env var)
 */

const http = require("node:http");
const https = require("node:https");
const zlib = require("node:zlib");

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 10;

function envFlag(name) {
  const value = process.env[name];
  return value === "1" || value === "true" || value === "yes";
}

/** Whether to disable TLS certificate verification (disabled by default). */
function defaultInsecureTLS() {
  return envFlag("G79_TLS_INSECURE");
}

function decompressBody(body, contentEncoding) {
  const enc = String(contentEncoding || "").toLowerCase();
  if (!enc || body.length === 0) return body;
  try {
    if (enc.includes("gzip")) return zlib.gunzipSync(body);
    if (enc.includes("deflate")) return zlib.inflateSync(body);
    if (enc.includes("br")) return zlib.brotliDecompressSync(body);
  } catch (err) {
    // Some servers declare an encoding incorrectly; in that case keep the original body.
    return body;
  }
  return body;
}

function normalizeHeaderValue(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/**
 * Perform one HTTP request (without handling redirects).
 * @returns {Promise<{statusCode:number, headers:Object, body:Buffer}>}
 */
function doRequest(urlObj, options) {
  return new Promise((resolve, reject) => {
    const {
      method = "GET",
      headers = {},
      body = null,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      insecureTLS = defaultInsecureTLS(),
      signal = null,
    } = options;

    if (signal && signal.aborted) {
      reject(signal.reason || new Error("request aborted"));
      return;
    }

    const isHttps = urlObj.protocol === "https:";
    const mod = isHttps ? https : http;

    const bodyBuffer = body === null || body === undefined ? null : Buffer.from(body);
    const finalHeaders = { ...headers };
    // Go's strings.Reader automatically sets Content-Length; set it explicitly here to avoid chunked encoding.
    if (bodyBuffer && !hasHeader(finalHeaders, "content-length") && !hasHeader(finalHeaders, "transfer-encoding")) {
      finalHeaders["Content-Length"] = String(bodyBuffer.length);
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
      if (signal) signal.removeEventListener("abort", onAbort);
      fn(value);
    };

    const req = mod.request(urlObj, requestOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", (err) => finish(reject, err));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const decoded = decompressBody(raw, res.headers["content-encoding"]);
        finish(resolve, {
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: decoded,
        });
      });
    });

    function onAbort() {
      req.destroy(signal.reason || new Error("request aborted"));
    }
    if (signal) signal.addEventListener("abort", onAbort, { once: true });

    req.on("timeout", () => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    });
    req.on("error", (err) => finish(reject, err));

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

/**
 * Perform an HTTP(S) request and follow redirects.
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<{statusCode:number, headers:Object, body:Buffer, url:string}>}
 */
async function httpRequest(url, options = {}) {
  let current = new URL(url);
  let method = options.method || "GET";
  let body = options.body;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const headers = { ...(options.headers || {}) };
    const res = await doRequest(current, { ...options, method, body, headers });

    const location = normalizeHeaderValue(res.headers.location);
    const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode) && location;
    if (!isRedirect) {
      return { ...res, url: current.toString() };
    }

    // Match Go's default behavior: 301/302/303 change POST to GET.
    if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      delete headers["content-type"];
      delete headers["Content-Type"];
      delete headers["content-length"];
      delete headers["Content-Length"];
    }
    current = new URL(location, current);
  }

  throw new Error(`too many redirects: ${url}`);
}

/** Read the response body (decompression already happens in doRequest; kept for interface compatibility). */
function readResponseBody(response) {
  return Buffer.from(response.body);
}

/** Decode the response body as UTF-8. */
function responseText(response) {
  return Buffer.from(response.body).toString("utf8");
}

/** HTTP client with default configuration. */
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
      method: "POST",
      body,
      ...options,
    });
  }

  async get(url, options = {}) {
    return this.request(url, { method: "GET", ...options });
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
