'use strict';

/**
 * MPay 用户与 Sauth 数据（对应 Go 版本 account/mpay/user.go）。
 */

const { randomHex } = require('./random');

const AIM_INFO = '{"aim":"127.0.0.1","country":"CN","tz":"+0800","tzid":""}';

function randomHexUpperString(byteLen) {
  try {
    return randomHex(byteLen).toUpperCase();
  } catch (err) {
    return '0'.repeat(byteLen * 2);
  }
}

/** 构建 sauth 数据（字段顺序与 Go 结构体保持一致）。 */
function newSauth(deviceID, sdkuid, sessionID, udid, isGuest) {
  return {
    aim_info: AIM_INFO,
    app_channel: 'netease',
    client_login_sn: randomHexUpperString(16),
    deviceid: deviceID,
    gameid: 'x19',
    gas_token: '',
    get_access_token: '1',
    ip: '127.0.0.1',
    is_unisdk_guest: isGuest ? 1 : 0,
    login_channel: 'netease',
    platform: 'pc',
    sdk_version: '3.9.0',
    sdkuid: sdkuid,
    sessionid: sessionID,
    source_app_channel: 'netease',
    source_platform: 'pc',
    udid: udid,
  };
}

class User {
  constructor({ sauth, mac, isGuest, ram, rom, email = '', password = '' }) {
    this.sauth = sauth;
    this.mac = mac;
    this.isGuest = Boolean(isGuest);
    this.ram = ram;
    this.rom = rom;
    this.email = email;
    this.password = password;
  }

  /** 生成可用于 Client.g79AuthenticateWithCookie 的 JSON 字符串。 */
  cookieString() {
    return JSON.stringify({
      sauth_json: JSON.stringify(this.sauth),
    });
  }

  toJSON() {
    const out = {
      sauth: this.sauth,
      mac: this.mac,
      is_guest: this.isGuest,
      ram: this.ram,
      rom: this.rom,
    };
    if (this.email) out.email = this.email;
    if (this.password) out.password = this.password;
    return out;
  }

  // Go 风格别名
  CookieString() {
    return this.cookieString();
  }

  get Sauth() { return this.sauth; }
  get Mac() { return this.mac; }
  get IsGuest() { return this.isGuest; }
  get Ram() { return this.ram; }
  get Rom() { return this.rom; }
  get Email() { return this.email; }
  get Password() { return this.password; }
}

function newUser(deviceID, sdkuid, sessionID, udid, mac, isGuest, ram, rom, email, password) {
  return new User({
    sauth: newSauth(deviceID, sdkuid, sessionID, udid, isGuest),
    mac,
    isGuest,
    ram,
    rom,
    email,
    password,
  });
}

module.exports = {
  User,
  newUser,
  newSauth,
  randomHexUpperString,
};
