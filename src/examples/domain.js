'use strict';

/** 山头服示例（对应 Go legacy-go/example/Domain）。 */

const { login } = require('./login');
const { toInt } = require('../types');

async function run(args = [], options = {}) {
  const inviteCode = args[0] || options.inviteCode;
  if (!inviteCode) {
    throw new Error('用法: node main.js domain <邀请码> [--cookie <json>] [--client-key <key>]');
  }

  const client = await login(options);

  const servers = await client.GetOtherDomainServers();
  for (const server of servers.entities || []) {
    await client.DeleteOtherDomainServer(server.sid);
  }

  const inviteResp = await client.JoinDomainServerWithInviteCode(inviteCode);
  if (toInt(inviteResp.code) !== 0) {
    throw new Error(`进入失败 因为: ${inviteResp.message}`);
  }

  const after = await client.GetOtherDomainServers();
  const first = (after.entities || [])[0];
  if (!first) throw new Error('加入后未查询到他服记录');
  console.log('server id:', first.sid);

  const enterResp = await client.RequestEnterDomainServer(first.sid);
  const entity = enterResp.entity || {};
  console.log(`服务器地址: ${entity.server_host}:${entity.server_port}`);

  if (options.clientKey) {
    const authv2 = client.GenerateDomainGameAuthV2(first.sid, options.clientKey);
    console.log('AuthV2:', authv2);
    const chain = await client.SendAuthV2Request(authv2);
    console.log('认证链:', chain);
  }
  return { client, serverId: first.sid, entity };
}

module.exports = { run };
