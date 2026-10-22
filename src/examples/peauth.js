'use strict';

/** PeAuth 登录示例（对应 Go legacy-go/example/peauth）。 */

const g79client = require('../index');

async function run(args = [], options = {}) {
  const hex = args[0] || options.hex;
  if (!hex) {
    throw new Error('用法: node main.js peauth <PeAuth十六进制字符串>');
  }
  const client = await g79client.NewClient({ requestTimeoutMs: options.timeoutMs ?? options.timeout });
  await client.G79AuthenticateWithPeAuth(hex);
  console.log(`认证成功，UserID=${client.userId}，昵称=${client.userDetail?.name ?? ''}`);
  return client;
}

module.exports = { run };
