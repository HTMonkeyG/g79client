"use strict";

/** Transfer server list example (mirrors Go legacy-go/example/transfer). */

const g79client = require("../src/index.js");

async function run() {
  const servers = await g79client.GetGlobalG79TransferServers();
  console.log(JSON.stringify(servers, null, 2));
  return servers;
}

module.exports = { run };
