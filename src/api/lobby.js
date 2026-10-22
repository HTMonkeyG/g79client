'use strict';

/**
 * 在线大厅相关接口（对应 Go 版本的 online_lobby_*.go）。
 */

const { callJSON } = require('./common');
const { G79Error } = require('../errors');
const { toStr, toInt } = require('../types');
const { getGameVersion } = require('../runtime');

/** 房间唯一标识：优先 room_id，其次 entity_id。 */
function onlineLobbyRoomId(entity) {
  const roomID = toStr(entity && entity.room_id);
  if (roomID !== '') return roomID;
  return toStr(entity && entity.entity_id);
}

/** 通过关键词搜索在线大厅房间。 */
async function searchOnlineLobbyRoomByKeyword(keyword, length = 20, offset = 0) {
  return callJSON(this, {
    api: '/online-lobby-room/query/search-by-name-v2',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      length,
      version: getGameVersion(),
      res_id: '',
      keyword: String(keyword),
      offset,
    },
    errorLabel: '在线大厅搜索响应',
  });
}

/** 根据房间号/关键字搜索并返回简要信息。 */
async function findOnlineLobbyRoomsByRoomNumber(roomNumber) {
  const resp = await this.searchOnlineLobbyRoomByKeyword(roomNumber, 20, 0);
  if (toInt(resp.code) !== 0) {
    throw new G79Error(`搜索失败(${resp.code}): ${resp.message}`);
  }
  return (resp.entities || []).map((entity) => ({
    roomId: onlineLobbyRoomId(entity),
    roomName: entity.room_name ?? '',
    ownerName: entity.owner_name ?? '',
  }));
}

/** 获取在线大厅房间详情。 */
async function getOnlineLobbyRoom(roomID) {
  return callJSON(this, {
    api: '/online-lobby-room/get',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { room_id: String(roomID) },
    errorLabel: '在线大厅详情响应',
  });
}

/** 进入在线大厅房间。 */
async function enterOnlineLobbyRoom(roomID, password = '') {
  return callJSON(this, {
    api: '/online-lobby-room-enter/',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      password: String(password ?? ''),
      room_id: String(roomID),
      lobby_manifest_version: '',
      // 保留原项目中的字段拼写
      check_visibilily: 1,
    },
    errorLabel: '在线大厅进入响应',
  });
}

/** 进入在线大厅游戏。 */
async function onlineLobbyGameEnter() {
  return callJSON(this, {
    api: '/online-lobby-game-enter',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {},
    errorLabel: '在线大厅游戏进入响应',
  });
}

module.exports = {
  onlineLobbyRoomId,
  searchOnlineLobbyRoomByKeyword,
  findOnlineLobbyRoomsByRoomNumber,
  getOnlineLobbyRoom,
  enterOnlineLobbyRoom,
  onlineLobbyGameEnter,
};
