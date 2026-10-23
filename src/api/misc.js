"use strict";

/**
 * Miscellaneous helpers (mirrors Go nickname_tracker.go).
 */

const { G79Error } = require("../errors.js");
const { toStr, toInt } = require("../types.js");
const { onlineLobbyRoomId } = require("./lobby.js");

function parseGameInfo(gi) {
  if (!gi) return null;
  if (typeof gi === "object") return gi;
  try {
    const parsed = JSON.parse(String(gi));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Locate a player's current room or rental server by nickname.
 *
 * First tries the exact user search and reads game_info;
 * if that fails, falls back to online lobby keyword search on owner/room names.
 *
 * @returns {Promise<{roomId:string, serverNo:string, serverId:string}>}
 */
async function findPlayerByNickname(nickname) {
  if (!nickname) {
    throw new G79Error("昵称不能为空");
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
    const loc = { roomId: "", serverNo: "", serverId: "" };

    if (gi && Object.keys(gi).length > 0) {
      // Note: Go's fmt.Sprint turns missing values into '<nil>'; treat them as empty strings here.
      // Avoid treating '<nil>' as a valid room ID.
      const gameType = toStr(gi["game-type"]);
      const gameID = toStr(gi["game-id"]);
      const gameInfo = parseGameInfo(gi["game-info"]);
      if (gameInfo) {
        if (gameInfo.room_id !== undefined && gameInfo.room_id !== null) {
          loc.roomId = toStr(gameInfo.room_id);
        }
        if (gameInfo.server_id !== undefined && gameInfo.server_id !== null) {
          loc.serverId = toStr(gameInfo.server_id);
        }
      }
      if (loc.roomId === "" && gameType === "1000" && gameID !== "") {
        loc.roomId = gameID;
      }
      if (loc.roomId !== "" || loc.serverId !== "") {
        return loc;
      }
    }
  }

  // Fallback: online lobby keyword search
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
        (ownerName !== "" && ownerName.toLowerCase().includes(lower))
      ) {
        return {
          roomId: onlineLobbyRoomId(entity),
          serverNo: "",
          serverId: "",
        };
      }
    }
  }

  throw new G79Error("未解析到玩家所在位置");
}

module.exports = {
  findPlayerByNickname,
};
