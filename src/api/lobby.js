"use strict";

/**
 * Online lobby APIs (mirrors Go online_lobby_*.go).
 */

const { callJSON } = require("./common.js");
const { G79Error } = require("../errors.js");
const { toStr, toInt } = require("../types.js");
const { getGameVersion } = require("../runtime.js");

/** Room identifier: prefer room_id, then entity_id. */
function onlineLobbyRoomId(entity) {
  const roomID = toStr(entity && entity.room_id);
  if (roomID !== "") return roomID;
  return toStr(entity && entity.entity_id);
}

/** Search online lobby rooms by keyword. */
async function searchOnlineLobbyRoomByKeyword(keyword, length = 20, offset = 0) {
  return callJSON(this, {
    api: "/online-lobby-room/query/search-by-name-v2",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      length,
      version: getGameVersion(),
      res_id: "",
      keyword: String(keyword),
      offset,
    },
    errorLabel: "在线大厅搜索响应",
  });
}

/** Search by room number/keyword and return brief results. */
async function findOnlineLobbyRoomsByRoomNumber(roomNumber) {
  const resp = await this.searchOnlineLobbyRoomByKeyword(roomNumber, 20, 0);
  if (toInt(resp.code) !== 0) {
    throw new G79Error(`搜索失败(${resp.code}): ${resp.message}`);
  }
  return (resp.entities || []).map((entity) => ({
    roomId: onlineLobbyRoomId(entity),
    roomName: entity.room_name ?? "",
    ownerName: entity.owner_name ?? "",
  }));
}

/** Get online lobby room details. */
async function getOnlineLobbyRoom(roomID) {
  return callJSON(this, {
    api: "/online-lobby-room/get",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { room_id: String(roomID) },
    errorLabel: "在线大厅详情响应",
  });
}

/** Enter an online lobby room. */
async function enterOnlineLobbyRoom(roomID, password = "") {
  return callJSON(this, {
    api: "/online-lobby-room-enter/",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      password: String(password ?? ""),
      room_id: String(roomID),
      lobby_manifest_version: "",
      // Keep the original field spelling
      check_visibilily: 1,
    },
    errorLabel: "在线大厅进入响应",
  });
}

/** Enter an online lobby game. */
async function onlineLobbyGameEnter() {
  return callJSON(this, {
    api: "/online-lobby-game-enter",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {},
    errorLabel: "在线大厅游戏进入响应",
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
