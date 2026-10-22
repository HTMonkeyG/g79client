'use strict';

/**
 * 传输服务器接口（对应 Go 版本的 transfer_room_with_name.go）。
 */

const { callJSON } = require('./common');

/** 根据房间名查询传输服务器中的房间列表。 */
async function getTransferRoomWithName(name) {
  return callJSON(this, {
    api: '/room-with-name',
    base: this.releaseJSON.transferServerNewHttpUrl,
    payload: {
      name: String(name),
      uid: this.getUserIdInt(),
    },
    contentType: 'application/json',
    acceptEncoding: true,
    sign: false,
    errorLabel: 'room-with-name 响应',
  });
}

module.exports = {
  getTransferRoomWithName,
};
