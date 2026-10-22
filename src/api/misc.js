'use strict';

/**
 * 杂项工具（对应 Go 版本的 nickname_tracker.go）。
 */

const { G79Error } = require('../errors');
const { toStr, toInt } = require('../types');
const { onlineLobbyRoomId } = require('./lobby');

function parseGameInfo(gi) {
  if (!gi) return null;
  if (typeof gi === 'object') return gi;
  try {
    const parsed = JSON.parse(String(gi));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * 根据昵称定位玩家当前所在的房间或租赁服。
 *
 * 优先使用精确用户搜索返回的 game_info；
 * 若无法解析，再用在线大厅关键字搜索匹配房主名/房间名。
 *
 * @returns {Promise<{roomId:string, serverNo:string, serverId:string}>}
 */
async function findPlayerByNickname(nickname) {
  if (!nickname) {
    throw new G79Error('昵称不能为空');
  }

  let userResp;
  try {
    userResp = await this.searchUserByNameOrMail(nickname, 0, 20);
  } catch (err) {
    throw new G79Error(`搜索用户失败: ${err.message}`);
  }

  if (toInt(userResp.code) === 0 && Array.isArray(userResp.entities) && userResp.entities.length > 0) {
    const first = userResp.entities[0] || {};
    const gi = parseGameInfo(first.game_info);
    const loc = { roomId: '', serverNo: '', serverId: '' };

    if (gi && Object.keys(gi).length > 0) {
      // 注意：Go 使用 fmt.Sprint 会把缺失值变成 "<nil>"，这里统一视为空字符串，
      // 避免把 "<nil>" 当作有效房间号。
      const gameType = toStr(gi['game-type']);
      const gameID = toStr(gi['game-id']);
      const gameInfo = parseGameInfo(gi['game-info']);
      if (gameInfo) {
        if (gameInfo.room_id !== undefined && gameInfo.room_id !== null) {
          loc.roomId = toStr(gameInfo.room_id);
        }
        if (gameInfo.server_id !== undefined && gameInfo.server_id !== null) {
          loc.serverId = toStr(gameInfo.server_id);
        }
      }
      if (loc.roomId === '' && gameType === '1000' && gameID !== '') {
        loc.roomId = gameID;
      }
      if (loc.roomId !== '' || loc.serverId !== '') {
        return loc;
      }
    }
  }

  // 兜底：在线大厅关键词搜索
  let searchResp = null;
  try {
    searchResp = await this.searchOnlineLobbyRoomByKeyword(nickname, 20, 0);
  } catch (err) {
    searchResp = null;
  }
  if (searchResp && toInt(searchResp.code) === 0 && Array.isArray(searchResp.entities)) {
    const lower = nickname.toLowerCase();
    for (const entity of searchResp.entities) {
      const ownerName = toStr(entity.owner_name);
      const roomName = toStr(entity.room_name);
      if (
        ownerName === nickname ||
        roomName === nickname ||
        (ownerName !== '' && ownerName.toLowerCase().includes(lower))
      ) {
        return {
          roomId: onlineLobbyRoomId(entity),
          serverNo: '',
          serverId: '',
        };
      }
    }
  }

  throw new G79Error('未解析到玩家所在位置');
}

module.exports = {
  findPlayerByNickname,
};
