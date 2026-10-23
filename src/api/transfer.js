"use strict";

/**
 * Transfer server APIs (mirrors Go transfer_room_with_name.go).
 */

const { callJSON } = require("./common.js");

/** Query rooms on the transfer server by room name. */
async function getTransferRoomWithName(name) {
  return callJSON(this, {
    api: "/room-with-name",
    base: this.releaseJSON.transferServerNewHttpUrl,
    payload: {
      name: String(name),
      uid: this.getUserIdInt(),
    },
    contentType: "application/json",
    acceptEncoding: true,
    sign: false,
    errorLabel: "room-with-name 响应",
  });
}

module.exports = {
  getTransferRoomWithName,
};
