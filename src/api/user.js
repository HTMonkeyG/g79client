'use strict';

/**
 * 用户相关接口（对应 Go 版本的 user_*.go、social_profile.go 等）。
 */

const { callJSON, getJSON } = require('./common');
const { G79Error } = require('../errors');
const { toInt } = require('../types');

const WPF_USER_AGENT = 'WPFLauncher/0.0.0.0';

function toUint64(value, name = 'value') {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new G79Error(`${name} 不是合法的 64 位无符号整数: ${value}`);
  }
  return n;
}

/** 获取当前用户详情。 */
async function getUserDetail() {
  return callJSON(this, {
    api: '/pe-user-detail/get',
    base: this.releaseJSON.coreServerUrl,
    payload: {},
    userAgent: WPF_USER_AGENT,
    errorLabel: '用户详情响应',
  });
}

/** 查询他人档案。 */
async function getOtherUserDetail(entityID, needRechargeBenefit = false) {
  if (String(entityID ?? '').trim() === '') {
    throw new G79Error('GetOtherUserDetail: entityID 不能为空');
  }
  return callJSON(this, {
    api: '/user-detail/query/other',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      entity_id: String(entityID),
      is_need_recharge_benefit: needRechargeBenefit ? 1 : 0,
    },
    acceptEncoding: true,
    errorLabel: '他人档案响应',
  });
}

/** 批量获取他人详情。 */
async function getUserElseDetailMany(uids) {
  const list = Array.isArray(uids) ? uids : [uids];
  return callJSON(this, {
    api: '/user-else-detail-many/',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      is_need_recharge_benefit: 1,
      uids: list.join(';'),
    },
    errorLabel: '他人详情(批量)',
  });
}

/**
 * 通过名称或邮箱搜索用户。
 * @param {string} nameOrMail
 * @param {number} [searchType=0] 0-精确 1-模糊
 * @param {number} [limit=20]
 */
async function searchUserByNameOrMail(nameOrMail, searchType = 0, limit = 20) {
  return callJSON(this, {
    api: '/user-search-friend/',
    base: this.releaseJSON.webServerUrl,
    payload: {
      name_or_mail: String(nameOrMail),
      search_type: searchType,
      limit,
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '用户搜索响应',
  });
}

/** 获取向当前玩家发起好友申请的列表。 */
async function getAddMeFriends() {
  return callJSON(this, {
    api: '/user-addme-friends/',
    base: this.releaseJSON.apiGatewayUrl,
    rawBody: '{}',
    acceptEncoding: true,
    errorLabel: '好友申请列表响应',
  });
}

/** 获取好友申请时的默认备注。 */
async function friendApplyComment() {
  if (this.userDetail && this.userDetail.name) {
    return this.userDetail.name;
  }
  try {
    const detail = await this.getUserDetail();
    if (detail && detail.entity) {
      this.userDetail = detail.entity;
      if (detail.entity.name) return detail.entity.name;
    }
  } catch (err) {
    // 忽略获取详情失败，使用默认备注。
  }
  return 'g79client';
}

/** 向指定玩家发送好友申请。 */
async function applyFriend(fid) {
  const id = toUint64(fid, 'fid');
  return callJSON(this, {
    api: '/user-apply-friend/',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      fid: id,
      comment: await friendApplyComment.call(this),
      add_type: 5,
      message: '',
      add_ui: '好友搜索',
    },
    acceptEncoding: true,
    errorLabel: '好友申请响应',
  });
}

/** 同意或拒绝好友申请。 */
async function replyFriend(fid, accept) {
  const id = toUint64(fid, 'fid');
  return callJSON(this, {
    api: '/user-reply-friend/',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      fid: id,
      accept: Boolean(accept),
      accept_ui: '联系人-好友申请',
    },
    acceptEncoding: true,
    errorLabel: '好友回复响应',
  });
}

/** 为动态点赞。 */
async function likeMoment(msgID, pushID = 0) {
  if (String(msgID ?? '').trim() === '') {
    throw new G79Error('LikeMoment: msgID 不能为空');
  }
  const payload = { msg_id: String(msgID) };
  const pushIdValue = toUint64(pushID, 'pushID');
  if (pushIdValue !== 0) {
    payload.push_id = pushIdValue;
  }
  return callJSON(this, {
    api: '/user-like-moment',
    base: this.releaseJSON.apiGatewayUrl,
    payload,
    acceptEncoding: true,
    errorLabel: '点赞动态响应',
  });
}

/** SendMomentOptions 的零值字段（与 Go 结构体保持一致）。 */
const SEND_MOMENT_DEFAULTS = {
  comment_auth: 0,
  category: '',
  extra: '',
  image: '',
  video: '',
  at_role_id: '',
  forward_uid: '',
  forward_msg_id: '',
  source_uid: '',
  source_msg_id: '',
};

/**
 * 发布个人动态。
 * 注意：与 Go 版本保持一致，请求体只包含 opts，content 仅用于校验；
 * opts 为 nil 时发送 JSON null，否则补齐 Go 结构体的零值字段。
 */
async function sendMoment(content, opts) {
  if (String(content ?? '').trim() === '') {
    throw new G79Error('SendMoment: content 不能为空');
  }

  let rawBody = 'null';
  if (opts !== null && opts !== undefined) {
    const merged = {};
    for (const [key, defaultValue] of Object.entries(SEND_MOMENT_DEFAULTS)) {
      const value = opts[key];
      merged[key] = value === undefined || value === null ? defaultValue : value;
    }
    rawBody = JSON.stringify(merged);
  }

  return callJSON(this, {
    api: '/user-send-moment',
    base: this.releaseJSON.apiGatewayUrl,
    rawBody,
    acceptEncoding: true,
    errorLabel: '发送动态响应',
  });
}

/** 拉取指定玩家的动态列表。 */
async function getUserMessages(targetUID, page = 1, num = 10) {
  if (String(targetUID ?? '').trim() === '') {
    throw new G79Error('GetUserMessages: targetUID 不能为空');
  }
  const actualPage = page > 0 ? page : 1;
  const actualNum = num > 0 ? num : 10;

  const after = await this.getPeUserLoginAfter();
  const uid = after.entity ? after.entity.moment_id : '';

  const endpoint = new URL('https://x19-pyq.webcgi.163.com/message/apps/x19/client/user_messages');
  endpoint.searchParams.set('target_uid', String(targetUID));
  endpoint.searchParams.set('uid', uid ?? '');
  endpoint.searchParams.set('page', String(actualPage));
  endpoint.searchParams.set('num', String(actualNum));

  const headers = {};
  if (this.userId) headers['user-id'] = this.userId;
  if (this.userToken) headers['user-token'] = this.userToken;

  return getJSON(this, {
    url: endpoint.toString(),
    headers,
    errorLabel: '动态列表响应',
  });
}

/** 获取热门话题列表。 */
async function getHotCategories() {
  const after = await this.getPeUserLoginAfter();
  const momentID = after.entity ? after.entity.moment_id : '';

  const endpoint = new URL('https://x19-pyq.webcgi.163.com/message/apps/x19/client/hot_categories');
  endpoint.searchParams.set('uid', momentID ?? '');

  return getJSON(this, {
    url: endpoint.toString(),
    errorLabel: '热门话题响应',
  });
}

/** 更新昵称。 */
async function updateNickname(nickname) {
  const response = await callJSON(this, {
    api: '/pe-nickname-setting/update',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { name: String(nickname) },
    errorLabel: '响应',
  });
  if (toInt(response.code) !== 0) {
    throw new G79Error(`更新昵称失败: ${response.message}`);
  }
  if (this.userDetail) {
    this.userDetail.name = nickname;
  }
  return response;
}

const SETTING_LIST = [
  'skin_type',
  'skin_data',
  'persona_data',
  'screen_config',
  'outfit_type',
  'personal_open',
  'personal_ad_open',
  'personal_tags',
  'bag_item',
];

/** 获取用户设置列表。 */
async function getUserSettingList() {
  return callJSON(this, {
    api: '/pe-get-user-setting-list',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { settings: SETTING_LIST.slice() },
    userAgent: WPF_USER_AGENT,
    errorLabel: '获取用户设置列表',
  });
}

/** 设置用户皮肤。 */
async function setUserSettingList(itemID) {
  return callJSON(this, {
    api: '/pe-set-user-setting-list',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {
      data: {
        skin_data: {
          item_id: String(itemID),
        },
      },
    },
    userAgent: WPF_USER_AGENT,
    errorLabel: '设置用户设置列表',
  });
}

/** 更换皮肤：先购买组件，再写入设置。 */
async function changeSkin(itemID) {
  const purchaseResponse = await this.purchaseItem(itemID);
  const purchaseCode = toInt(purchaseResponse.code);
  if (purchaseCode !== 0 && purchaseCode !== 502) {
    throw new G79Error(purchaseResponse.message);
  }
  return this.setUserSettingList(itemID);
}

/** 请求 /pe-user-login-after 并缓存响应。 */
async function getPeUserLoginAfter() {
  if (this.peUserLoginAfter) {
    return this.peUserLoginAfter;
  }
  const result = await callJSON(this, {
    api: '/pe-user-login-after',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { client_type: 'cocos' },
    acceptEncoding: true,
    errorLabel: 'pe-user-login-after 响应',
  });
  this.peUserLoginAfter = result;
  return result;
}

module.exports = {
  getUserDetail,
  getOtherUserDetail,
  getUserElseDetailMany,
  searchUserByNameOrMail,
  getAddMeFriends,
  friendApplyComment,
  applyFriend,
  replyFriend,
  likeMoment,
  sendMoment,
  getUserMessages,
  getHotCategories,
  updateNickname,
  getUserSettingList,
  setUserSettingList,
  changeSkin,
  getPeUserLoginAfter,
};
