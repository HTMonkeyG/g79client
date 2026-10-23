"use strict";

/**
 * Main city APIs (mirrors Go enter_main_city.go, leave_main_city.go,
 * and main_city_leave_game.go).
 */

const { callJSON } = require("./common.js");
const { G79Error } = require("../errors.js");
const { getGameVersion, getOSName } = require("../runtime.js");

const WPF_USER_AGENT = "WPFLauncher/0.0.0.0";

/** Enter the main city and resolve the server address for the target version. */
async function enterMainCity() {
  return callJSON(this, {
    api: "/enter-main-city",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { version: getGameVersion() },
    userAgent: WPF_USER_AGENT,
    acceptEncoding: true,
    errorLabel: "进入主城响应",
  });
}

/** Leave the main city session. */
async function leaveMainCity() {
  return callJSON(this, {
    api: "/leave-main-city",
    base: this.releaseJSON.apiGatewayUrl,
    payload: {},
    userAgent: WPF_USER_AGENT,
    acceptEncoding: true,
    errorLabel: "退出主城响应",
  });
}

/**
 * Report the 'left main city without entering a game' event to the drpf log service.
 * Mirrors Go LeaveEnteredGame.
 */
async function leaveEnteredGame() {
  if (!this.userId) {
    throw new G79Error("leave entered game: missing user id");
  }

  if (!this.userDetail) {
    try {
      const detail = await this.getUserDetail();
      this.userDetail = detail.entity || null;
    } catch (err) {
      // Ignore failures while fetching the user detail.
    }
  }

  const roleName = this.userDetail && this.userDetail.name ? this.userDetail.name : this.userId;
  // Approximates Go time.Now().UnixNano(): millisecond timestamp plus a nanosecond monotonic remainder.
  const nanoPart = process.hrtime.bigint() % 1000000n;
  const sessionID = `${this.userId}${(BigInt(Date.now()) * 1000000n + nanoPart).toString()}`;

  const payload = {
    is_emulator: "None",
    jf_gameid: "None",
    ip: "None",
    common_int2: 0,
    game_session_id: sessionID,
    common_int3: 0,
    app_ver: this.engineVersion,
    country_code: 86,
    uid: this.userId,
    device_level: 2,
    transid: "None",
    operate_type: "leave_main_city_no_game",
    isp_name: "default",
    sead: this.seed,
    os_ver: "11",
    network: "CHANNEL_UNKNOW",
    login_channel: "netease",
    oaid: "None",
    app_channel: "netease",
    role_id: this.userId,
    source: "netease_p2",
    patch_ver: this.g79LatestVersion,
    msg: "",
    engine_ver: this.engineVersion,
    extra_info: "{}",
    type: "user_log",
    location: "None",
    common_int1: 0,
    testFlag: false,
    os_name: getOSName(),
    account_id: "",
    is_root: "None",
    role_name: roleName,
    imei: "None",
    WebServerUrl: this.releaseJSON.webServerUrl,
    common_str2: "",
    sub_type: "",
    common_str1: "",
    main_type: "main_city",
    device_model: "UNKNOWN",
    patchVersion: "None",
    server: this.releaseJSON.coreServerUrl,
    project: "g79",
    udid: this.userId,
    caid: "None",
    mac_addr: "02:00:00:00:00:00",
    account_user_name: "None",
    error_code: "",
    common_str3: "",
    launch_type: "cocos",
  };

  const res = await this.request("https://drpf-g79.proxima.nie.netease.com", {
    method: "POST",
    headers: {
      "User-Agent": "libhttpclient/1.0.0.0",
      "Accept-Encoding": "gzip",
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(payload),
  });

  const text = res.body.toString("utf8").trim();
  if (res.statusCode !== 200) {
    throw new G79Error(`leave entered game: unexpected status ${res.statusCode}: ${text}`);
  }
  if (text !== "ok") {
    throw new G79Error(`leave entered game: unexpected response "${text}"`);
  }
  return true;
}

module.exports = {
  enterMainCity,
  leaveMainCity,
  leaveEnteredGame,
};
