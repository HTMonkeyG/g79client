'use strict';

/**
 * 主城相关接口（对应 Go 版本的 enter_main_city.go、leave_main_city.go、
 * main_city_leave_game.go）。
 */

const { callJSON } = require('./common');
const { G79Error } = require('../errors');
const { getGameVersion, getOSName } = require('../runtime');

const WPF_USER_AGENT = 'WPFLauncher/0.0.0.0';

/** 进入主城，获取目标版本的服务器地址。 */
async function enterMainCity() {
  return callJSON(this, {
    api: '/enter-main-city',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { version: getGameVersion() },
    userAgent: WPF_USER_AGENT,
    acceptEncoding: true,
    errorLabel: '进入主城响应',
  });
}

/** 退出主城会话。 */
async function leaveMainCity() {
  return callJSON(this, {
    api: '/leave-main-city',
    base: this.releaseJSON.apiGatewayUrl,
    payload: {},
    userAgent: WPF_USER_AGENT,
    acceptEncoding: true,
    errorLabel: '退出主城响应',
  });
}

/**
 * 向 drpf 日志服务上报“退出主城且未进入游戏”事件。
 * 对应 Go 的 LeaveEnteredGame。
 */
async function leaveEnteredGame() {
  if (!this.userId) {
    throw new G79Error('leave entered game: missing user id');
  }

  if (!this.userDetail) {
    try {
      const detail = await this.getUserDetail();
      this.userDetail = detail.entity || null;
    } catch (err) {
      // 忽略获取详情失败。
    }
  }

  const roleName = this.userDetail && this.userDetail.name ? this.userDetail.name : this.userId;
  // 近似 Go 的 time.Now().UnixNano()：毫秒时间戳 + 纳秒级单调时钟余数
  const nanoPart = process.hrtime.bigint() % 1000000n;
  const sessionID = `${this.userId}${(BigInt(Date.now()) * 1000000n + nanoPart).toString()}`;

  const payload = {
    is_emulator: 'None',
    jf_gameid: 'None',
    ip: 'None',
    common_int2: 0,
    game_session_id: sessionID,
    common_int3: 0,
    app_ver: this.engineVersion,
    country_code: 86,
    uid: this.userId,
    device_level: 2,
    transid: 'None',
    operate_type: 'leave_main_city_no_game',
    isp_name: 'default',
    sead: this.seed,
    os_ver: '11',
    network: 'CHANNEL_UNKNOW',
    login_channel: 'netease',
    oaid: 'None',
    app_channel: 'netease',
    role_id: this.userId,
    source: 'netease_p2',
    patch_ver: this.g79LatestVersion,
    msg: '',
    engine_ver: this.engineVersion,
    extra_info: '{}',
    type: 'user_log',
    location: 'None',
    common_int1: 0,
    testFlag: false,
    os_name: getOSName(),
    account_id: '',
    is_root: 'None',
    role_name: roleName,
    imei: 'None',
    WebServerUrl: this.releaseJSON.webServerUrl,
    common_str2: '',
    sub_type: '',
    common_str1: '',
    main_type: 'main_city',
    device_model: 'UNKNOWN',
    patchVersion: 'None',
    server: this.releaseJSON.coreServerUrl,
    project: 'g79',
    udid: this.userId,
    caid: 'None',
    mac_addr: '02:00:00:00:00:00',
    account_user_name: 'None',
    error_code: '',
    common_str3: '',
    launch_type: 'cocos',
  };

  const res = await this.request('https://drpf-g79.proxima.nie.netease.com', {
    method: 'POST',
    headers: {
      'User-Agent': 'libhttpclient/1.0.0.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(payload),
  });

  const text = res.body.toString('utf8').trim();
  if (res.statusCode !== 200) {
    throw new G79Error(`leave entered game: unexpected status ${res.statusCode}: ${text}`);
  }
  if (text !== 'ok') {
    throw new G79Error(`leave entered game: unexpected response "${text}"`);
  }
  return true;
}

module.exports = {
  enterMainCity,
  leaveMainCity,
  leaveEnteredGame,
};
