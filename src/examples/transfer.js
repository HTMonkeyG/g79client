'use strict';

/** 传输服务器列表示例（对应 Go legacy-go/example/transfer）。 */

const g79client = require('../index');

async function run() {
  const servers = await g79client.GetGlobalG79TransferServers();
  console.log(JSON.stringify(servers, null, 2));
  return servers;
}

module.exports = { run };
