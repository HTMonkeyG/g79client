'use strict';

/**
 * 认证流程（对应 Go 版本 auth.go）。
 * 这些函数会被挂载到 Client.prototype 上，因此内部使用 this 访问客户端状态。
 */

const crypto = require('node:crypto');

const {
  g79HttpEncrypt,
  g79HttpDecrypt,
  x19HttpEncrypt,
  x19HttpDecrypt,
  calculateDynamicToken,
  getValidJSON,
} = require('./crypto');
const {
  randomBytes,
  hexDecode,
  hexEncode,
} = require('./utils/bytes');
const { peAuthSign } = require('./utils/encryption');
const {
  g79AndroidStep,
  g79AndroidStep2,
  g79LibraryHash,
  g79SignatureHash,
  g79AndroidMessageTag,
  x19DefaultVersion,
} = require('./engine_consts');
const runtime = require('./runtime');
const { toBool, toInt, toStr } = require('./types');

// ---------------------------------------------------------------------------
// Cookie 解析辅助
// ---------------------------------------------------------------------------

function parseCookieData(cookieStr) {
  let cookie;
  try {
    cookie = typeof cookieStr === 'string' ? JSON.parse(cookieStr) : cookieStr;
  } catch (err) {
    throw new Error(`解析Cookie失败: ${err.message}`);
  }
  if (!cookie || typeof cookie !== 'object') {
    throw new Error('解析Cookie失败: cookie 必须是 JSON 对象');
  }

  let sauth = cookie.sauth_json;
  if (typeof sauth === 'string') {
    try {
      sauth = JSON.parse(sauth);
    } catch (err) {
      throw new Error(`解析SauthJSON失败: ${err.message}`);
    }
  }
  if (!sauth || typeof sauth !== 'object') {
    throw new Error('解析SauthJSON失败: sauth_json 必须存在');
  }
  return { cookie, sauth, sauthString: typeof cookie.sauth_json === 'string' ? cookie.sauth_json : JSON.stringify(sauth) };
}

function macAddress(cookie) {
  let mac = toStr(cookie.mac_addr).trim().toUpperCase();
  if (mac === '') return '02:00:00:00:00:00';
  mac = mac.replace(/-/g, ':');
  return mac;
}

function ramValue(cookie) {
  return toStr(cookie.ram).trim() === '' ? '4294967296' : toStr(cookie.ram);
}

function romValue(cookie) {
  return toStr(cookie.rom);
}

function isGuestFlag(cookie) {
  return toBool(cookie.is_guest) ? 1 : 0;
}

function emulatorFlag(cookie) {
  return toInt(cookie.emulator);
}

function generateClientLoginSN() {
  return randomBytes(16).toString('hex').toUpperCase();
}

function buildAndroidSauthPayload(sauthData, clientLoginSN) {
  let aimInfo = toStr(sauthData.aim_info).trim();
  if (aimInfo === '') {
    aimInfo = '{"aim":"127.0.0.1","country":"CN","tz":"+0800","tzid":"","celluar_ip":"","operator":"","is_vpn_enabled":"false"}';
  }
  let sdkVersion = toStr(sauthData.sdk_version).trim();
  if (sdkVersion === '') sdkVersion = '5.9.0';
  let ip = toStr(sauthData.ip).trim();
  if (ip === '') ip = '127.0.0.1';
  let gameID = toStr(sauthData.gameid).trim();
  if (gameID === '') gameID = 'x19';

  return {
    aim_info: aimInfo,
    app_channel: 'netease',
    client_login_sn: clientLoginSN,
    deviceid: toStr(sauthData.deviceid),
    gameid: gameID,
    gas_token: toStr(sauthData.gas_token),
    get_access_token: '1',
    ip,
    is_unisdk_guest: 0,
    login_channel: 'netease',
    platform: 'ad',
    sdk_version: sdkVersion,
    sdkuid: toStr(sauthData.sdkuid),
    sessionid: toStr(sauthData.sessionid),
    source_app_channel: 'netease',
    source_platform: 'ad',
    step: g79AndroidStep,
    step2: g79AndroidStep2,
    udid: toStr(sauthData.udid),
  };
}

function buildAndroidSaDataPayload(client, sauthData, cookieData) {
  let sdkVersion = toStr(sauthData.sdk_version).trim();
  if (sdkVersion === '') sdkVersion = '5.9.0';
  let udid = toStr(sauthData.udid);
  if (udid.trim() === '') udid = '0000000000000000';

  return {
    app_channel: 'netease',
    app_ver: client.g79LatestVersion,
    core_num: 'u0004',
    cpu_digit: '64',
    cpu_hz: '2465600',
    cpu_name: 'placeholder',
    device_height: '900',
    device_model: 'SAMSUNG#SM-G977N',
    device_width: '1600',
    disk: '',
    emulator: emulatorFlag(cookieData),
    first_udid: udid,
    is_guest: isGuestFlag(cookieData),
    launcher_type: 'PE_C++',
    mac_addr: macAddress(cookieData),
    network: 'mm_10086',
    os_name: 'android',
    os_ver: '5.1.1',
    ram: ramValue(cookieData),
    rom: romValue(cookieData),
    root: false,
    sdk_ver: sdkVersion,
    start_type: 'default',
    udid,
  };
}

// ---------------------------------------------------------------------------
// G79 PE 认证
// ---------------------------------------------------------------------------

async function g79AuthenticateWithCookie(cookieStr) {
  this.cookie = cookieStr;
  const { cookie, sauth } = parseCookieData(cookieStr);

  try {
    await g79PerformPEAuthWithCookie.call(this, sauth, cookie);
  } catch (err) {
    throw new Error(`PE认证失败: ${err.message}`);
  }

  let detail;
  try {
    detail = await this.getUserDetail();
  } catch (err) {
    throw new Error(`获取用户信息失败: ${err.message}`);
  }
  this.userDetail = detail.entity || null;
  return this;
}

async function g79PerformPEAuthWithCookie(sauthData, cookieData) {
  if (!sauthData) {
    throw new Error('缺少 sauth 数据');
  }
  if (!this.g79LatestVersion || !this.patchResourcesHash) {
    throw new Error('缺少补丁信息，请重新初始化客户端');
  }

  const required = {
    sdkuid: sauthData.sdkuid,
    sessionid: sauthData.sessionid,
    udid: sauthData.udid,
    deviceid: sauthData.deviceid,
  };
  for (const [field, value] of Object.entries(required)) {
    if (toStr(value).trim() === '') {
      throw new Error(`sauth_json 缺少字段 ${field}`);
    }
  }

  const seed = crypto.randomUUID();
  this.seed = seed;

  const clientLoginSN = generateClientLoginSN();
  const sauthPayload = buildAndroidSauthPayload(sauthData, clientLoginSN);
  const saDataPayload = buildAndroidSaDataPayload(this, sauthData, cookieData);
  const saDataJSON = JSON.stringify(saDataPayload);

  const versionMessage = `${this.engineVersion}${g79LibraryHash}${this.g79LatestVersion}${this.patchResourcesHash}${g79SignatureHash}${seed}`;
  const [signSp, signTr] = this.peAuthSignParams || [2, 9];
  const sign = peAuthSign(versionMessage, signSp, signTr);

  const peauth = {
    engine_version: this.engineVersion,
    extra_param: 'extra',
    message: versionMessage,
    patch_version: this.g79LatestVersion,
    pay_channel: g79AndroidMessageTag,
    sa_data: saDataJSON,
    sauth_json: sauthPayload,
    seed,
    sign,
  };

  const payload = Buffer.from(JSON.stringify(peauth), 'utf8');
  const encryptedPayload = g79HttpEncrypt(payload);

  const url = `${this.releaseJSON.coreServerUrl}/pe-authentication`;
  const res = await this.request(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'libhttpclient/1.0.0.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
    },
    body: hexEncode(encryptedPayload),
  });

  const respBody = res.body.toString('utf8');
  let decryptedResp;
  try {
    decryptedResp = g79HttpDecrypt(hexDecode(respBody));
  } catch (err) {
    throw new Error(`解密登录响应失败: ${err.message}`);
  }
  const validJSON = getValidJSON(decryptedResp);

  let loginResp;
  try {
    loginResp = JSON.parse(validJSON.toString('utf8'));
  } catch (err) {
    throw new Error(`解析登录响应失败: ${err.message}, 响应内容: ${validJSON.toString('utf8')}`);
  }

  if (toInt(loginResp.code) !== 0) {
    throw new Error(`登录失败 (code: ${loginResp.code}): ${loginResp.message}`);
  }

  const entity = loginResp.entity || {};
  this.setCredentials(entity.entity_id, entity.token);
  this.seed = entity.seed ?? '';
  return this;
}

async function g79AuthenticateWithPeAuth(peAuthHexStr) {
  let encryptedPeAuth;
  try {
    encryptedPeAuth = hexDecode(peAuthHexStr);
  } catch (err) {
    throw new Error(`解析 PeAuth 失败: ${err.message}`);
  }

  let peAuthBytes;
  try {
    peAuthBytes = g79HttpDecrypt(encryptedPeAuth);
  } catch (err) {
    throw new Error(`解密 PeAuth 失败: ${err.message}`);
  }
  peAuthBytes = getValidJSON(peAuthBytes);

  let peAuthData;
  try {
    peAuthData = JSON.parse(peAuthBytes.toString('utf8'));
  } catch (err) {
    throw new Error(`解析 PeAuth JSON 失败: ${err.message}`);
  }

  const cookie = JSON.stringify({
    sauth_json: JSON.stringify(peAuthData.sauth_json),
  });
  await g79AuthenticateWithCookie.call(this, cookie);
  return this;
}

// ---------------------------------------------------------------------------
// X19 认证
// ---------------------------------------------------------------------------

async function x19AuthenticateWithCookie(cookieStr) {
  this.cookie = cookieStr;
  const { cookie, sauthString } = parseCookieData(cookieStr);

  const loginURL = `${this.x19ReleaseJSON.coreServerUrl}/login-otp`;
  const loginRes = await this.request(loginURL, {
    method: 'POST',
    headers: {
      'User-Agent': 'libhttpclient/1.0.0.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
    },
    body: cookieStr,
  });

  const respBody = loginRes.body.toString('utf8');
  let loginResp;
  try {
    loginResp = JSON.parse(respBody);
  } catch (err) {
    throw new Error(`解析登录响应失败: ${err.message}, 响应内容: ${respBody}`);
  }
  if (toInt(loginResp.code) !== 0) {
    throw new Error(`登录失败 (code: ${loginResp.code}): ${loginResp.message}`);
  }
  const otpEntity = loginResp.entity || {};
  if (!otpEntity.otp_token) {
    throw new Error('登录响应缺少 otp_token');
  }

  const saData = {
    os_name: 'windows',
    os_ver: 'Microsoft Windows 10',
    mac_addr: 'B8975A4AD616',
    udid: 'BFEBFBFF000306A9C78C00D8',
    app_ver: x19DefaultVersion,
    sdk_ver: '',
    network: '',
    disk: 'C78C00D8',
    is64bit: '1',
    video_card1: 'Video_card1',
    video_card2: '',
    video_card3: '',
    video_card4: '',
    launcher_type: 'PC_java',
    pay_channel: '4399pc',
    dotnet_ver: '4.8.0',
    cpu_type: 'Intel(R) Xeon(R) CPU i32100 3.10GHz',
    ram_size: '8553332736',
    device_width: '1920',
    device_height: '1080',
    os_detail: '10',
  };
  const saDataJSON = JSON.stringify(saData);

  const authData = {
    sa_data: saDataJSON,
    sauth_json: sauthString,
    version: {
      version: x19DefaultVersion,
      launcher_md5: null,
      updater_md5: null,
    },
    sdkuid: null,
    aid: String(toInt(otpEntity.aid)),
    hasMessage: false,
    hasGmail: false,
    otp_token: otpEntity.otp_token,
    otp_pwd: null,
    lock_time: toInt(otpEntity.lock_time),
    env: null,
    min_engine_version: null,
    min_patch_version: null,
    unisdk_login_json: null,
    verify_status: toInt(otpEntity.verify_status),
    token: null,
    is_register: true,
    entity_id: null,
  };

  const authPayload = JSON.stringify(authData);
  const encryptedAuthPayload = x19HttpEncrypt(Buffer.from(authPayload, 'utf8'));

  const authRes = await this.request(`${this.x19ReleaseJSON.coreServerUrl}/authentication-otp`, {
    method: 'POST',
    headers: {
      'User-Agent': 'libhttpclient/1.0.0.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'user-id': '',
      'user-token': calculateDynamicToken('/authentication-otp', authPayload, ''),
    },
    body: encryptedAuthPayload,
  });

  let decryptedAuthResp;
  try {
    decryptedAuthResp = x19HttpDecrypt(authRes.body);
  } catch (err) {
    throw new Error(`解密响应失败: ${err.message}`);
  }
  const validAuthRespJSON = getValidJSON(decryptedAuthResp);

  let loginRespData;
  try {
    loginRespData = JSON.parse(validAuthRespJSON.toString('utf8'));
  } catch (err) {
    throw new Error(`解析登录响应失败: ${err.message}`);
  }
  if (toInt(loginRespData.code) !== 0) {
    throw new Error(`登录失败 (code: ${loginRespData.code}): ${loginRespData.message}`);
  }

  const entity = loginRespData.entity || {};
  this.setCredentials(entity.entity_id, entity.token);
  this.seed = entity.seed ?? '';

  let detail;
  try {
    detail = await this.getUserDetail();
  } catch (err) {
    throw new Error(`获取用户信息失败: ${err.message}`);
  }
  this.userDetail = detail.entity || null;
  this.releaseJSON.apiGatewayUrl = this.x19ReleaseJSON.apiGatewayGrayUrl;
  return this;
}

// ---------------------------------------------------------------------------
// AuthV2
// ---------------------------------------------------------------------------

function requireUserDetail(client) {
  if (!client.userDetail || !client.userDetail.name) {
    throw new Error('用户信息未初始化，请先完成认证');
  }
  return client.userDetail;
}

function buildAuthV2(client, sidKind, serverID, clientKey, options = {}) {
  const detail = requireUserDetail(client);
  if (!serverID) {
    throw new Error('serverID 不能为空');
  }
  const authv2 = {
    bit: '64',
    clientKey: String(clientKey ?? ''),
    displayName: detail.name,
    engineVersion: client.engineVersion,
    netease_sid: `${String(serverID)}:${sidKind}`,
    os_name: options.pc ? 'windows' : runtime.getOSName(),
    patchVersion: options.pc ? '' : client.g79LatestVersion,
    uid: client.getUserIdInt(),
  };
  if (options.pc) {
    authv2.pcCheck = '0';
    authv2.platform = 'pc';
  }
  return JSON.stringify(authv2);
}

function generateRentalGameAuthV2(serverID, clientKey) {
  return buildAuthV2(this, 'RentalGame', serverID, clientKey);
}

function generateDomainGameAuthV2(serverID, clientKey) {
  return buildAuthV2(this, 'DomainGame', serverID, clientKey);
}

function generatePCDomainGameAuthV2(serverID, clientKey) {
  return buildAuthV2(this, 'DomainGame', serverID, clientKey, { pc: true });
}

function generateLobbyGameAuthV2(roomID, clientKey) {
  return buildAuthV2(this, 'LobbyGame', roomID, clientKey);
}

function generatePCLobbyGameAuthV2(roomID, clientKey) {
  return buildAuthV2(this, 'LobbyGame', roomID, clientKey, { pc: true });
}

function generateNetworkGameAuthV2(roomID, clientKey) {
  return buildAuthV2(this, 'NetworkGame', roomID, clientKey);
}

async function sendAuthV2Request(authv2Data) {
  const api = '/authentication-v2';
  const payload = Buffer.isBuffer(authv2Data) ? authv2Data : Buffer.from(String(authv2Data), 'utf8');

  const encryptedData = g79HttpEncrypt(payload);
  const token = calculateDynamicToken(api, payload.toString('utf8'), this.userToken);

  const res = await this.request(`${this.releaseJSON.authServerUrl}${api}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'libhttpclient/1.0.0.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'user-id': this.userId,
      'user-token': hexEncode(Buffer.from(token, 'utf8')),
    },
    body: hexEncode(encryptedData),
  });

  const respBody = res.body.toString('utf8');
  const decryptedResp = g79HttpDecrypt(hexDecode(respBody));
  return getValidJSON(decryptedResp).toString('utf8');
}

module.exports = {
  g79AuthenticateWithCookie,
  g79PerformPEAuthWithCookie,
  g79AuthenticateWithPeAuth,
  x19AuthenticateWithCookie,
  generateRentalGameAuthV2,
  generateDomainGameAuthV2,
  generatePCDomainGameAuthV2,
  generateLobbyGameAuthV2,
  generatePCLobbyGameAuthV2,
  generateNetworkGameAuthV2,
  sendAuthV2Request,
  // 便于测试
  parseCookieData,
  buildAndroidSauthPayload,
  buildAndroidSaDataPayload,
  generateClientLoginSN,
};
