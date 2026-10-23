"use strict";

/** Basic login example (mirrors Go legacy-go/example/main.go and legacy-go/example/login). */

const g79client = require("../src/index.js");
const { getCookie } = require("./common.js");

/**
 * Authenticate with a Cookie.
 * @param {object} [options]
 * @param {string} [options.cookie]
 * @param {boolean} [options.x19] use X19 authentication
 * @returns {Promise<import("../src/index.js").Client>}
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

/** CLI entry: log in and print user information. */
async function run(args = [], options = {}) {
  const client = await login(options);
  const detail = client.userDetail || {};
  console.log(`用户ID: ${client.userId}`);
  console.log(`昵称: ${detail.name ?? ""}`);
  console.log(`等级: ${detail.level ?? ""}`);
  console.log(`种子: ${client.seed}`);
  return client;
}

module.exports = { login, run };
