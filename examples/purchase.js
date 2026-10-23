"use strict";

/** Purchase component example (mirrors Go legacy-go/example/purchase). */

const { login } = require("./login.js");

async function run(args = [], options = {}) {
  const itemID = args[0] || options.itemId;
  if (!itemID) {
    throw new Error("用法: node main.js purchase <组件ID> [--cookie <json>]");
  }
  const client = await login(options);

  const purchase = await client.PurchaseItem(itemID);
  console.log("购买结果:", JSON.stringify(purchase, null, 2));

  const download = await client.GetDownloadInfo(itemID);
  console.log("下载信息:", JSON.stringify(download, null, 2));
  return { purchase, download };
}

module.exports = { run };
