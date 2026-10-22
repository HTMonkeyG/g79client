'use strict';

/**
 * 各 API 模块共用的请求封装。
 */

const { calculateDynamicToken } = require('../crypto');
const { G79Error } = require('../errors');

const DEFAULT_USER_AGENT = 'libhttpclient/1.0.0.0';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

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
 * 发送 JSON 请求并解析响应。
 *
 * @param {object} client Client 实例
 * @param {object} options
 * @param {string} options.api 接口路径
 * @param {string} options.base 基础 URL
 * @param {object} [options.payload] 请求体对象
 * @param {string} [options.rawBody] 直接指定请求体字符串
 * @param {string} [options.userAgent]
 * @param {string} [options.contentType]
 * @param {boolean} [options.acceptEncoding=false]
 * @param {boolean} [options.sign=true] 是否计算 user-token
 * @param {boolean} [options.sendUserId=true]
 * @param {string} [options.token] 覆盖签名 token
 * @param {string} [options.errorLabel='响应']
 * @param {object} [options.headers]
 */
async function callJSON(client, options) {
  const hasRawBody = Object.prototype.hasOwnProperty.call(options, 'rawBody');
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
    errorLabel = '响应',
    headers: extraHeaders = {},
  } = options;

  if (!base) {
    throw new G79Error(`接口 ${api} 缺少基础 URL（可能尚未完成认证或初始化）`);
  }

  const body = buildBody(payload, rawBody, hasRawBody);
  const headers = {
    'Content-Type': contentType,
    'User-Agent': userAgent,
  };
  if (acceptEncoding) headers['Accept-Encoding'] = 'gzip';
  if (sendUserId) headers['user-id'] = client.userId;
  if (sign) {
    headers['user-token'] = calculateDynamicToken(api, body, token ?? client.userToken);
  }
  Object.assign(headers, extraHeaders);

  const res = await client.request(`${base}${api}`, {
    method: 'POST',
    headers,
    body,
  });
  return parseJSONBody(res.body.toString('utf8'), errorLabel);
}

/** 发送 GET 请求并解析 JSON 响应。 */
async function getJSON(client, options) {
  const {
    url,
    headers: extraHeaders = {},
    errorLabel = '响应',
  } = options;
  const res = await client.request(url, {
    method: 'GET',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
  return parseJSONBody(res.body.toString('utf8'), errorLabel);
}

module.exports = {
  DEFAULT_USER_AGENT,
  JSON_CONTENT_TYPE,
  callJSON,
  getJSON,
  parseJSONBody,
};
