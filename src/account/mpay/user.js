"use strict";

/**
 * MPay user and Sauth data (mirrors Go account/mpay/user.go).
 */

const { randomHex } = require("./random.js");

const AIM_INFO = "{\"aim\":\"127.0.0.1\",\"country\":\"CN\",\"tz\":\"+0800\",\"tzid\":\"\"}";

function randomHexUpperString(byteLen) {
  try {
    return randomHex(byteLen).toUpperCase();
  } catch (err) {
    return "0".repeat(byteLen * 2);
  }
}

/** Build sauth data (field order matches the Go struct). */
function newSauth(deviceID, sdkuid, sessionID, udid, isGuest) {
  return {
    aim_info: AIM_INFO,
    app_channel: "netease",
    client_login_sn: randomHexUpperString(16),
    deviceid: deviceID,
    gameid: "x19",
    gas_token: "",
    get_access_token: "1",
    ip: "127.0.0.1",
    is_unisdk_guest: isGuest ? 1 : 0,
    login_channel: "netease",
    platform: "pc",
    sdk_version: "3.9.0",
    sdkuid: sdkuid,
    sessionid: sessionID,
    source_app_channel: "netease",
    source_platform: "pc",
    udid: udid,
  };
}

class User {
  constructor({ sauth, mac, isGuest, ram, rom, email = "", password = "" }) {
    this.sauth = sauth;
    this.mac = mac;
    this.isGuest = Boolean(isGuest);
    this.ram = ram;
    this.rom = rom;
    this.email = email;
    this.password = password;
  }

  /** Build the JSON string accepted by Client.g79AuthenticateWithCookie. */
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

  // Go-style aliases
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
