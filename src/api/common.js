"use strict";

/**
 * Shared request helpers for all API modules.
 */

const { calculateDynamicToken } = require("../crypto.js");
const { G79Error } = require("../errors.js");

const DEFAULT_USER_AGENT = "libhttpclient/1.0.0.0";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function buildBody(payload, rawBody, hasRawBody) {
  if (hasRawBody) return rawBody;
  return JSON.stringify(payload ?? {});
}

function parseJSONBody(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new G79Error(`解析${label}失败: ${err.message}, 响应内容: ${text}`);
  }
}

/**
 * Send a JSON request and parse the response.
 *
 * @param {object} client Client instance
 * @param {object} options
 * @param {string} options.api API path
 * @param {string} options.base Base URL
 * @param {object} [options.payload] Request body object
 * @param {string} [options.rawBody] Raw request body string
 * @param {string} [options.userAgent]
 * @param {string} [options.contentType]
 * @param {boolean} [options.acceptEncoding=false]
 * @param {boolean} [options.sign=true] Whether to calculate user-token
 * @param {boolean} [options.sendUserId=true]
 * @param {string} [options.token] Token used for signing
 * @param {string} [options.errorLabel='response']
 * @param {object} [options.headers]
 */
async function callJSON(client, options) {
  const hasRawBody = Object.prototype.hasOwnProperty.call(options, "rawBody");
  const {
    api,
    base,
    payload,
    rawBody,
    userAgent = DEFAULT_USER_AGENT,
    contentType = JSON_CONTENT_TYPE,
    acceptEncoding = false,
    sign = true,
    sendUserId = true,
    token,
    errorLabel = "响应",
    headers: extraHeaders = {},
  } = options;

  if (!base) {
    throw new G79Error(`接口 ${api} 缺少基础 URL（可能尚未完成认证或初始化）`);
  }

  const body = buildBody(payload, rawBody, hasRawBody);
  const headers = {
    "Content-Type": contentType,
    "User-Agent": userAgent,
  };
  if (acceptEncoding) headers["Accept-Encoding"] = "gzip";
  if (sendUserId) headers["user-id"] = client.userId;
  if (sign) {
    headers["user-token"] = calculateDynamicToken(api, body, token ?? client.userToken);
  }
  Object.assign(headers, extraHeaders);

  const res = await client.request(`${base}${api}`, {
    method: "POST",
    headers,
    body,
  });
  return parseJSONBody(res.body.toString("utf8"), errorLabel);
}

/** Send a GET request and parse the JSON response. */
async function getJSON(client, options) {
  const {
    url,
    headers: extraHeaders = {},
    errorLabel = "响应",
  } = options;
  const res = await client.request(url, {
    method: "GET",
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
  return parseJSONBody(res.body.toString("utf8"), errorLabel);
}

module.exports = {
  DEFAULT_USER_AGENT,
  JSON_CONTENT_TYPE,
  callJSON,
  getJSON,
  parseJSONBody,
};
