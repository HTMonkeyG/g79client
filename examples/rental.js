"use strict";

/** Rental server example (mirrors Go legacy-go/example/main.go and rental_available_list). */

const g79client = require("../src/index.js");
const { login } = require("./login.js");

async function run(args = [], options = {}) {
  const serverName = args[0] || options.server;
  const password = args[1] || options.password || "";
  const client = await login(options);

  if (!serverName) {
    const list = await client.GetAvailableRentalServers(
      g79client.SortTypePlayerCount,
      g79client.OrderTypeDesc,
      0,
    );
    console.log(JSON.stringify(list, null, 2));
    return list;
  }

  const searchResp = await client.SearchRentalServerByName(serverName);
  if (g79client.toInt(searchResp.code) !== 0 || !(searchResp.entities || []).length) {
    throw new Error("获取租赁服信息失败");
  }

  const serverID = searchResp.entities[0].entity_id;
  console.log("租赁服 ID:", serverID);

  const enterResp = await client.EnterRentalServerWorld(serverID, password);
  if (g79client.toInt(enterResp.code) !== 0) {
    throw new Error(`获取租赁服地址失败: ${enterResp.message}`);
  }
  const entity = enterResp.entity || {};
  console.log(`服务器地址: ${entity.mcserver_host}:${entity.mcserver_port}`);

  if (options.clientKey) {
    const authv2 = client.GenerateRentalGameAuthV2(serverID, options.clientKey);
    console.log("AuthV2:", authv2);
    const chain = await client.SendAuthV2Request(authv2);
    console.log("认证链:", chain);
  }
  return { client, serverID, entity };
}

module.exports = { run };
