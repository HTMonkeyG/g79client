'use strict';

/**
 * 租赁服相关接口（对应 Go 版本的 rental_*.go）。
 */

const { callJSON } = require('./common');

const WPF_USER_AGENT = 'WPFLauncher/0.0.0.0';

// 与 Go 版本 iota 常量保持一致。
const SortTypePlayerCount = 0;
const SortTypeNewest = 1;
const SortTypeMostPopular = 2;
const SortTypeComprehensive = 3;

const OrderTypeDesc = 0;
const OrderTypeAsc = 1;

/** 按排序批量拉取可用租赁服列表。 */
async function getAvailableRentalServers(sortType = SortTypeComprehensive, orderType = OrderTypeDesc, offset = 0) {
  return callJSON(this, {
    api: '/rental-server/query/available-by-sort-type',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      sort_type: sortType,
      order_type: orderType,
      offset,
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '可用租赁服列表',
  });
}

/** 按名称搜索租赁服。 */
async function searchRentalServerByName(serverName) {
  return callJSON(this, {
    api: '/rental-server/query/search-by-name',
    base: this.releaseJSON.webServerUrl,
    payload: { server_name: String(serverName) },
    userAgent: WPF_USER_AGENT,
    errorLabel: '搜索响应',
  });
}

/** 获取租赁服详情（含容量）。 */
async function getRentalServerDetails(serverID) {
  return callJSON(this, {
    api: '/rental-server-details/get',
    base: this.releaseJSON.webServerUrl,
    payload: { server_id: String(serverID) },
    userAgent: WPF_USER_AGENT,
    errorLabel: '租赁服详情响应',
  });
}

/** 进入租赁服世界。 */
async function enterRentalServerWorld(serverID, serverPassword) {
  return callJSON(this, {
    api: '/rental-server-world-enter/get',
    base: this.releaseJSON.webServerUrl,
    payload: {
      server_id: String(serverID),
      pwd: String(serverPassword ?? ''),
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '进入租赁服响应',
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
