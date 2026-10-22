'use strict';

/**
 * g79client JavaScript 版主入口。
 * 汇总所有模块，并把接口方法挂载到 Client.prototype 上。
 */

const runtime = require('./runtime');
const engineConsts = require('./engine_consts');
const cryptoModule = require('./crypto');
const globals = require('./globals');
const types = require('./types');
const errors = require('./errors');
const clientCore = require('./client_core');
const auth = require('./auth');

const userApi = require('./api/user');
const rentalApi = require('./api/rental');
const domainApi = require('./api/domain');
const lobbyApi = require('./api/lobby');
const storeApi = require('./api/store');
const mainCityApi = require('./api/main_city');
const peGameApi = require('./api/pe_game');
const transferApi = require('./api/transfer');
const miscApi = require('./api/misc');

const mpay = require('./account/mpay');
const chatConnection = require('./services/chat_connection');
const linkConnection = require('./services/link_connection');

const { Client } = clientCore;

const METHOD_GROUPS = [
  [auth, [
    'g79AuthenticateWithCookie',
    'g79AuthenticateWithPeAuth',
    'x19AuthenticateWithCookie',
    'generateRentalGameAuthV2',
    'generateDomainGameAuthV2',
    'generatePCDomainGameAuthV2',
    'generateLobbyGameAuthV2',
    'generatePCLobbyGameAuthV2',
    'generateNetworkGameAuthV2',
    'sendAuthV2Request',
  ]],
  [userApi, [
    'getUserDetail',
    'getOtherUserDetail',
    'getUserElseDetailMany',
    'searchUserByNameOrMail',
    'getAddMeFriends',
    'applyFriend',
    'replyFriend',
    'likeMoment',
    'sendMoment',
    'getUserMessages',
    'getHotCategories',
    'updateNickname',
    'getUserSettingList',
    'setUserSettingList',
    'changeSkin',
    'getPeUserLoginAfter',
  ]],
  [rentalApi, [
    'getAvailableRentalServers',
    'searchRentalServerByName',
    'getRentalServerDetails',
    'enterRentalServerWorld',
  ]],
  [domainApi, [
    'deleteOtherDomainServer',
    'getDomainServerDetail',
    'getOtherDomainServers',
    'joinDomainServerWithInviteCode',
    'requestEnterDomainServer',
    'requestLeaveDomainServer',
  ]],
  [lobbyApi, [
    'searchOnlineLobbyRoomByKeyword',
    'findOnlineLobbyRoomsByRoomNumber',
    'getOnlineLobbyRoom',
    'enterOnlineLobbyRoom',
    'onlineLobbyGameEnter',
  ]],
  [storeApi, [
    'purchaseItem',
    'searchMcGameItems',
    'getBuyItemResult',
    'userItemPurchase',
    'getDownloadInfo',
  ]],
  [mainCityApi, [
    'enterMainCity',
    'leaveMainCity',
    'leaveEnteredGame',
  ]],
  [peGameApi, [
    'getPeGameServerAddress',
  ]],
  [transferApi, [
    'getTransferRoomWithName',
  ]],
  [miscApi, [
    'findPlayerByNickname',
  ]],
];

function installMethods(moduleObject, names) {
  for (const name of names) {
    const fn = moduleObject[name];
    if (typeof fn !== 'function') {
      throw new Error(`内部错误: 未找到方法 ${name}`);
    }
    Client.prototype[name] = fn;

    // 同时提供 Go 风格的首字母大写别名
    const alias = name.charAt(0).toUpperCase() + name.slice(1);
    if (!Object.prototype.hasOwnProperty.call(Client.prototype, alias)) {
      Client.prototype[alias] = fn;
    }
  }
}

for (const [group, names] of METHOD_GROUPS) {
  installMethods(group, names);
}

// 显式补充 Go 中的特殊命名
if (!Client.prototype.GetUserIDInt) {
  Client.prototype.GetUserIDInt = Client.prototype.getUserIdInt;
}
if (!Client.prototype.SetCredentials) {
  Client.prototype.SetCredentials = Client.prototype.setCredentials;
}

// 兼容 Go 结构体字段名的访问器
Object.defineProperties(Client.prototype, {
  UserID: {
    get() { return this.userId; },
    set(value) { this.userId = value; },
  },
  UserToken: {
    get() { return this.userToken; },
    set(value) { this.userToken = value; },
  },
  Seed: {
    get() { return this.seed; },
    set(value) { this.seed = value; },
  },
  Cookie: {
    get() { return this.cookie; },
    set(value) { this.cookie = value; },
  },
  EngineVersion: {
    get() { return this.engineVersion; },
    set(value) { this.engineVersion = value; },
  },
  G79LatestVersion: {
    get() { return this.g79LatestVersion; },
    set(value) { this.g79LatestVersion = value; },
  },
  PatchResourcesHash: {
    get() { return this.patchResourcesHash; },
    set(value) { this.patchResourcesHash = value; },
  },
  UserDetail: {
    get() { return this.userDetail; },
    set(value) { this.userDetail = value; },
  },
  ReleaseJSON: {
    get() { return this.releaseJSON; },
    set(value) { this.releaseJSON = value; },
  },
  X19ReleaseJSON: {
    get() { return this.x19ReleaseJSON; },
    set(value) { this.x19ReleaseJSON = value; },
  },
});

const exported = {
  // 客户端
  Client,
  NewClient: clientCore.newClient,
  newClient: clientCore.newClient,
  createClient: clientCore.newClient,
  Refetch: clientCore.refetch,
  refetch: clientCore.refetch,
  startAutoRefresh: clientCore.startAutoRefresh,
  stopAutoRefresh: clientCore.stopAutoRefresh,

  // 加密
  ...cryptoModule,

  // 全局配置
  ...globals,

  // 类型与错误
  ...types,
  ...errors,

  // 枚举常量
  SortTypePlayerCount: rentalApi.SortTypePlayerCount,
  SortTypeNewest: rentalApi.SortTypeNewest,
  SortTypeMostPopular: rentalApi.SortTypeMostPopular,
  SortTypeComprehensive: rentalApi.SortTypeComprehensive,
  OrderTypeDesc: rentalApi.OrderTypeDesc,
  OrderTypeAsc: rentalApi.OrderTypeAsc,
  SortType: rentalApi.SortType,
  OrderType: rentalApi.OrderType,

  // 辅助函数
  onlineLobbyRoomId: lobbyApi.onlineLobbyRoomId,
  authHelpers: {
    parseCookieData: auth.parseCookieData,
    buildAndroidSauthPayload: auth.buildAndroidSauthPayload,
    buildAndroidSaDataPayload: auth.buildAndroidSaDataPayload,
    generateClientLoginSN: auth.generateClientLoginSN,
  },

  // 常量
  GameVersion: engineConsts.GameVersion,
  EngineConstants: engineConsts,
  ...engineConsts,

  // 运行期状态
  getEngineVersion: runtime.getEngineVersion,
  setEngineVersion: runtime.setEngineVersion,
  getOSName: runtime.getOSName,
  setOSName: runtime.setOSName,
  getGameVersion: runtime.getGameVersion,
  runtime,

  // 子模块
  mpay,
  chatConnection,
  linkConnection,
  chat_connection: chatConnection,
  link_connection: linkConnection,

  // 工具
  utils: {
    bytes: require('./utils/bytes'),
    aes: require('./utils/aes'),
    chacha8: require('./utils/chacha8'),
    encryption: require('./utils/encryption'),
    zip: require('./utils/zip'),
    async: require('./utils/async'),
  },
  http: require('./http_util'),
};

// Go 风格的包级变量访问器
Object.defineProperties(exported, {
  EngineVersion: {
    enumerable: true,
    get: runtime.getEngineVersion,
    set: runtime.setEngineVersion,
  },
  OSName: {
    enumerable: true,
    get: runtime.getOSName,
    set: runtime.setOSName,
  },
});

module.exports = exported;
