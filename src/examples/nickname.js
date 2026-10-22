'use strict';

/** 昵称定位示例（对应 Go legacy-go/example/NicknameTracker 与 NicknameUID）。 */

const { login } = require('./login');

async function run(args = [], options = {}) {
  const nickname = args[0] || options.nickname;
  if (!nickname) {
    throw new Error('用法: node main.js nickname <昵称> [--cookie <json>]');
  }
  const client = await login(options);

  const resp = await client.SearchUserByNameOrMail(nickname, 0, 20);
  console.log('搜索结果:', JSON.stringify(resp, null, 2));

  try {
    const loc = await client.FindPlayerByNickname(nickname);
    console.log(`昵称=${nickname} 的位置: room_id=${loc.roomId}, server_no=${loc.serverNo}, server_id=${loc.serverId}`);
    return { client, resp, loc };
  } catch (err) {
    console.log('定位失败:', err.message);
    return { client, resp, loc: null };
  }
}

module.exports = { run };
