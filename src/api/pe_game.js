"use strict";

/**
 * Network game / PE game entry APIs (mirrors Go pe_game_get_server_address.go).
 */

const { callJSON } = require("./common.js");

/** Get the server address for entering a network game. */
async function getPeGameServerAddress(itemID) {
  return callJSON(this, {
    api: "/pe-game/query/get-server-address",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      item_id: String(itemID),
      ticket: null,
    },
    acceptEncoding: true,
    errorLabel: "网络游戏进入响应",
  });
}

module.exports = {
  getPeGameServerAddress,
};
