'use strict';

/** 基础登录示例（对应 Go legacy-go/example/main.go 与 example/login）。 */

const g79client = require('../index');
const { getCookie } = require('./common');

/**
 * 使用 Cookie 完成认证。
 * @param {object} [options]
 * @param {string} [options.cookie]
 * @param {boolean} [options.x19] 使用 X19 认证
 * @returns {Promise<import('../index').Client>}
 */
async function login(options = {}) {
  const cookie = getCookie(options);
  const client = await g79client.NewClient({ requestTimeoutMs: options.timeoutMs ?? options.timeout });
  if (options.x19) {
    await client.X19AuthenticateWithCookie(cookie);
  } else {
    await client.G79AuthenticateWithCookie(cookie);
  }
  return client;
}

/** CLI 入口：登录并输出用户信息。 */
async function run(args = [], options = {}) {
  const client = await login(options);
  const detail = client.userDetail || {};
  console.log(`用户ID: ${client.userId}`);
  console.log(`昵称: ${detail.name ?? ''}`);
  console.log(`等级: ${detail.level ?? ''}`);
  console.log(`种子: ${client.seed}`);
  return client;
}

module.exports = { login, run };
