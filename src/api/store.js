'use strict';

/**
 * 商城 / 组件相关接口（对应 Go 版本的 store_*.go、download_get_info.go）。
 */

const { callJSON } = require('./common');
const { G79Error } = require('../errors');

const WPF_USER_AGENT = 'WPFLauncher/0.0.0.0';

/** 购买组件。 */
async function purchaseItem(itemID) {
  return callJSON(this, {
    api: '/pe-purchase-item/',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      item_id: String(itemID),
      expertcomment_info: {
        expertcomment_id: '0',
        video_url: '0',
        expert_id: '0',
      },
      buy_path: `商城:${itemID}`,
      coupon_ids: [],
      cdk_code: '',
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '购买组件',
  });
}

/** 按组件 ID / 实体 ID 搜索商城组件。 */
async function searchMcGameItems(itemIDs) {
  const list = Array.isArray(itemIDs) ? itemIDs : [];
  return callJSON(this, {
    api: '/item-buy-list/query/search-mcgame-items',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      item_ids: list.map(String),
      entity_ids: list.map(String),
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '组件搜索响应',
  });
}

/** 查询指定订单的购买结果。 */
async function getBuyItemResult(orderID, buyType) {
  return callJSON(this, {
    api: '/buy-item-result',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      orderid: String(orderID),
      buy_type: buyType,
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '购买结果响应',
  });
}

/** 购买指定资源 ID 的组件（X19 DC Web 接口）。 */
async function userItemPurchase(itemID) {
  if (String(itemID ?? '') === '') {
    throw new G79Error('itemID is empty');
  }
  return callJSON(this, {
    api: '/user-item-purchase',
    base: this.x19ReleaseJSON.dcWebUrl,
    payload: {
      entity_id: 0,
      item_id: String(itemID),
      item_level: 0,
      user_id: this.userId,
      purchase_time: 0,
      last_play_time: 0,
      total_play_time: 0,
      receiver_id: '',
      buy_path: 'PC_H5_COMPONENT_DETAIL',
      coupon_ids: [],
      diamond: 0,
      activity_name: '',
      batch_count: 1,
    },
    errorLabel: '用户组件购买响应',
  });
}

/** 获取组件下载地址。 */
async function getDownloadInfo(itemID) {
  return callJSON(this, {
    api: '/pe-download-item/get-download-info',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { item_id: String(itemID) },
    userAgent: WPF_USER_AGENT,
    errorLabel: '获取组件下载地址',
  });
}

module.exports = {
  purchaseItem,
  searchMcGameItems,
  getBuyItemResult,
  userItemPurchase,
  getDownloadInfo,
};
