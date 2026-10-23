"use strict";

/** Main city example (mirrors Go legacy-go/example/MainCity). */

const { login } = require("./login.js");

async function run(args = [], options = {}) {
  const client = await login(options);

  await client.LeaveMainCity().catch((err) => console.log("离开主城失败:", err.message));
  await client.LeaveEnteredGame().catch((err) => console.log("上报离开事件失败:", err.message));

  const info = await client.EnterMainCity();
  const entity = info.entity || {};
  console.log(JSON.stringify(info, null, 2));
  console.log(`服务器地址: ${entity.server_host}:${entity.server_port}`);

  if (options.clientKey) {
    const roomID = String(entity.city_no ?? "");
    const authv2 = client.GenerateLobbyGameAuthV2(roomID, options.clientKey);
    console.log("AuthV2:", authv2);
    const chain = await client.SendAuthV2Request(authv2);
    console.log("认证链:", chain);
  }
  return { client, info };
}

module.exports = { run };
