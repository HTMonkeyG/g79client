'use strict';

/** 全局配置刷新示例。 */

const g79client = require('../index');

async function run() {
  await g79client.Refetch();
  console.log('引擎版本:', g79client.EngineVersion);
  const [packList, release, x19, chat, link, transfer] = await Promise.all([
    g79client.GetGlobalG79PackList(),
    g79client.GetGlobalG79ReleaseJSON(),
    g79client.GetGlobalX19ReleaseJSON(),
    g79client.GetGlobalG79ChatServers(),
    g79client.GetGlobalG79LinkServers(),
    g79client.GetGlobalG79TransferServers(),
  ]);
  console.log(JSON.stringify({ packList, release, x19, chat, link, transfer }, null, 2));
  return { packList, release, x19, chat, link, transfer };
}

module.exports = { run };
