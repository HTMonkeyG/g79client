"use strict";

/**
 * Rental server APIs (mirrors Go rental_*.go).
 */

const { callJSON } = require("./common.js");

const WPF_USER_AGENT = "WPFLauncher/0.0.0.0";

// Keep the same iota values as the Go version.
const SortTypePlayerCount = 0;
const SortTypeNewest = 1;
const SortTypeMostPopular = 2;
const SortTypeComprehensive = 3;

const OrderTypeDesc = 0;
const OrderTypeAsc = 1;

/** Fetch available rental servers with sorting and pagination. */
async function getAvailableRentalServers(sortType = SortTypeComprehensive, orderType = OrderTypeDesc, offset = 0) {
  return callJSON(this, {
    api: "/rental-server/query/available-by-sort-type",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      sort_type: sortType,
      order_type: orderType,
      offset,
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: "可用租赁服列表",
  });
}

/** Search rental servers by name. */
async function searchRentalServerByName(serverName) {
  return callJSON(this, {
    api: "/rental-server/query/search-by-name",
    base: this.releaseJSON.webServerUrl,
    payload: { server_name: String(serverName) },
    userAgent: WPF_USER_AGENT,
    errorLabel: "搜索响应",
  });
}

/** Get rental server details (including capacity). */
async function getRentalServerDetails(serverID) {
  return callJSON(this, {
    api: "/rental-server-details/get",
    base: this.releaseJSON.webServerUrl,
    payload: { server_id: String(serverID) },
    userAgent: WPF_USER_AGENT,
    errorLabel: "租赁服详情响应",
  });
}

/** Enter a rental server world. */
async function enterRentalServerWorld(serverID, serverPassword) {
  return callJSON(this, {
    api: "/rental-server-world-enter/get",
    base: this.releaseJSON.webServerUrl,
    payload: {
      server_id: String(serverID),
      pwd: String(serverPassword ?? ""),
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: "进入租赁服响应",
  });
}

module.exports = {
  SortTypePlayerCount,
  SortTypeNewest,
  SortTypeMostPopular,
  SortTypeComprehensive,
  OrderTypeDesc,
  OrderTypeAsc,
  SortType: {
    PlayerCount: SortTypePlayerCount,
    Newest: SortTypeNewest,
    MostPopular: SortTypeMostPopular,
    Comprehensive: SortTypeComprehensive,
  },
  OrderType: {
    Desc: OrderTypeDesc,
    Asc: OrderTypeAsc,
  },
  getAvailableRentalServers,
  searchRentalServerByName,
  getRentalServerDetails,
  enterRentalServerWorld,
};
