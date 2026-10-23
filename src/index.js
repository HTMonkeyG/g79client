"use strict";

/**
 * g79client JavaScript entry point.
 * Aggregates all modules and mounts API methods on Client.prototype.
 */

const runtime = require("./runtime.js");
const engineConsts = require("./engine_consts.js");
const cryptoModule = require("./crypto.js");
const globals = require("./globals.js");
const types = require("./types.js");
const errors = require("./errors.js");
const clientCore = require("./client_core.js");
const auth = require("./auth.js");

const userApi = require("./api/user.js");
const rentalApi = require("./api/rental.js");
const domainApi = require("./api/domain.js");
const lobbyApi = require("./api/lobby.js");
const storeApi = require("./api/store.js");
const mainCityApi = require("./api/main_city.js");
const peGameApi = require("./api/pe_game.js");
const transferApi = require("./api/transfer.js");
const miscApi = require("./api/misc.js");

const mpay = require("./account/mpay/index.js");
const chatConnection = require("./services/chat_connection/index.js");
const linkConnection = require("./services/link_connection/index.js");

const { Client } = clientCore;

const METHOD_GROUPS = [
  [auth, [
    "g79AuthenticateWithCookie",
    "g79AuthenticateWithPeAuth",
    "x19AuthenticateWithCookie",
    "generateRentalGameAuthV2",
    "generateDomainGameAuthV2",
    "generatePCDomainGameAuthV2",
    "generateLobbyGameAuthV2",
    "generatePCLobbyGameAuthV2",
    "generateNetworkGameAuthV2",
    "sendAuthV2Request",
  ]],
  [userApi, [
    "getUserDetail",
    "getOtherUserDetail",
    "getUserElseDetailMany",
    "searchUserByNameOrMail",
    "getAddMeFriends",
    "applyFriend",
    "replyFriend",
    "likeMoment",
    "sendMoment",
    "getUserMessages",
    "getHotCategories",
    "updateNickname",
    "getUserSettingList",
    "setUserSettingList",
    "changeSkin",
    "getPeUserLoginAfter",
  ]],
  [rentalApi, [
    "getAvailableRentalServers",
    "searchRentalServerByName",
    "getRentalServerDetails",
    "enterRentalServerWorld",
  ]],
  [domainApi, [
    "deleteOtherDomainServer",
    "getDomainServerDetail",
    "getOtherDomainServers",
    "joinDomainServerWithInviteCode",
    "requestEnterDomainServer",
    "requestLeaveDomainServer",
  ]],
  [lobbyApi, [
    "searchOnlineLobbyRoomByKeyword",
    "findOnlineLobbyRoomsByRoomNumber",
    "getOnlineLobbyRoom",
    "enterOnlineLobbyRoom",
    "onlineLobbyGameEnter",
  ]],
  [storeApi, [
    "purchaseItem",
    "searchMcGameItems",
    "getBuyItemResult",
    "userItemPurchase",
    "getDownloadInfo",
  ]],
  [mainCityApi, [
    "enterMainCity",
    "leaveMainCity",
    "leaveEnteredGame",
  ]],
  [peGameApi, [
    "getPeGameServerAddress",
  ]],
  [transferApi, [
    "getTransferRoomWithName",
  ]],
  [miscApi, [
    "findPlayerByNickname",
  ]],
];

function installMethods(moduleObject, names) {
  for (const name of names) {
    const fn = moduleObject[name];
    if (typeof fn !== "function") {
      throw new Error(`内部错误: 未找到方法 ${name}`);
    }
    Client.prototype[name] = fn;

    // Also provide Go-style capitalized aliases
    const alias = name.charAt(0).toUpperCase() + name.slice(1);
    if (!Object.prototype.hasOwnProperty.call(Client.prototype, alias)) {
      Client.prototype[alias] = fn;
    }
  }
}

for (const [group, names] of METHOD_GROUPS) {
  installMethods(group, names);
}

// Explicitly add the special Go names
if (!Client.prototype.GetUserIDInt) {
  Client.prototype.GetUserIDInt = Client.prototype.getUserIdInt;
}
if (!Client.prototype.SetCredentials) {
  Client.prototype.SetCredentials = Client.prototype.setCredentials;
}

// Accessors compatible with Go struct field names
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
  // Client
  Client,
  NewClient: clientCore.newClient,
  newClient: clientCore.newClient,
  createClient: clientCore.newClient,
  Refetch: clientCore.refetch,
  refetch: clientCore.refetch,
  startAutoRefresh: clientCore.startAutoRefresh,
  stopAutoRefresh: clientCore.stopAutoRefresh,

  // Encryption
  ...cryptoModule,

  // Global configuration
  ...globals,

  // Types and errors
  ...types,
  ...errors,

  // Enum constants
  SortTypePlayerCount: rentalApi.SortTypePlayerCount,
  SortTypeNewest: rentalApi.SortTypeNewest,
  SortTypeMostPopular: rentalApi.SortTypeMostPopular,
  SortTypeComprehensive: rentalApi.SortTypeComprehensive,
  OrderTypeDesc: rentalApi.OrderTypeDesc,
  OrderTypeAsc: rentalApi.OrderTypeAsc,
  SortType: rentalApi.SortType,
  OrderType: rentalApi.OrderType,

  // Helper functions
  onlineLobbyRoomId: lobbyApi.onlineLobbyRoomId,
  authHelpers: {
    parseCookieData: auth.parseCookieData,
    buildAndroidSauthPayload: auth.buildAndroidSauthPayload,
    buildAndroidSaDataPayload: auth.buildAndroidSaDataPayload,
    generateClientLoginSN: auth.generateClientLoginSN,
  },

  // Constants
  GameVersion: engineConsts.GameVersion,
  EngineConstants: engineConsts,
  ...engineConsts,

  // Runtime state
  getEngineVersion: runtime.getEngineVersion,
  setEngineVersion: runtime.setEngineVersion,
  getOSName: runtime.getOSName,
  setOSName: runtime.setOSName,
  getGameVersion: runtime.getGameVersion,
  runtime,

  // Submodules
  mpay,
  chatConnection,
  linkConnection,
  chat_connection: chatConnection,
  link_connection: linkConnection,

  // Utilities
  utils: {
    bytes: require("./utils/bytes.js"),
    aes: require("./utils/aes.js"),
    chacha8: require("./utils/chacha8.js"),
    encryption: require("./utils/encryption.js"),
    zip: require("./utils/zip.js"),
    async: require("./utils/async.js"),
  },
  http: require("./http_util.js"),
};

// Go-style package-level variable accessors
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
