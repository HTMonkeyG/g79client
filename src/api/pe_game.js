'use strict';

/**
 * 网络游戏 / PE 游戏入口接口（对应 Go 版本的 pe_game_get_server_address.go）。
 */

const { callJSON } = require('./common');

/** 获取网络游戏进入的服务器地址。 */
async function getPeGameServerAddress(itemID) {
  return callJSON(this, {
    api: '/pe-game/query/get-server-address',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      item_id: String(itemID),
      ticket: null,
    },
    acceptEncoding: true,
    errorLabel: '网络游戏进入响应',
  });
}

module.exports = {
  getPeGameServerAddress,
};
