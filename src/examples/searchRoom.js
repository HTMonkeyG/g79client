'use strict';

/** 在线大厅房间搜索示例（对应 Go legacy-go/example/SearchOnlineLobbyRoom）。 */

const { login } = require('./login');
const { toInt } = require('../types');

async function run(args = [], options = {}) {
  const keyword = args[0] || options.keyword;
  if (!keyword) {
    throw new Error('用法: node main.js search-room <关键字> [--cookie <json>]');
  }

  const client = await login({ ...options, x19: options.x19 });
  console.log(`登录成功, 用户ID: ${client.userId}, 昵称: ${client.userDetail?.name ?? ''}`);

  const resp = await client.SearchOnlineLobbyRoomByKeyword(keyword, 10, 0);
  if (toInt(resp.code) !== 0) {
    throw new Error(`搜索在线大厅房间失败(${resp.code}): ${resp.message}`);
  }

  console.log(`共找到 ${resp.total ?? 0} 个房间:`);
  for (const room of resp.entities || []) {
    const roomId = room.room_id ?? room.entity_id ?? '';
    console.log(`- room_id=${roomId} 房间名=${room.room_name ?? ''} 房主=${room.owner_name ?? ''} 简介=${room.slogan ?? ''}`);
  }
  return resp;
}

module.exports = { run };
