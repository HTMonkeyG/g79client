"use strict";

/**
 * MPay device registration and login flow (mirrors Go account/mpay/device.go).
 */

const crypto = require("node:crypto");

const { hexDecode, hexEncode, md5 } = require("../../utils/bytes.js");
const { aesEcbEncrypt } = require("../../utils/aes.js");
const { NeedVerifyError } = require("../../errors.js");
const { MpayClient } = require("./client.js");
const { randomHex } = require("./random.js");
const { newUser } = require("./user.js");

const DEVICE_ENDPOINT = "/mpay/games/aecfrxodyqaaaajp-g-x19/devices";
const REAL_NAME_ENDPOINT = "/mpay/api/users/realname/update_by_token";

const CONSTANTS = {
  defaultGameID: "aecfrxodyqaaaajp-g-x19",
  defaultGV: "840268037",
  defaultGVN: "3.3.15.268037",
  defaultCV: "a5.2.0",
  defaultSV: "32",
  defaultAppType: "games",
  defaultAppMode: "2",
  defaultAppChannel: "netease",
  defaultMCountAppKey: "EEkEEXLymcNjM42yLY3Bn6AO15aGy4yq",
  defaultCloudExtraBase64: "e30=",
  defaultOptFields: "nickname,avatar,realname_status,mobile_bind_status,exit_popup_info,mask_related_mobile,related_login_status",
  defaultRAMBytes: "8034369536",
  defaultROMBytes: "128849018880",
};

/** Convert an arbitrary value to a string (mirrors mpay.toString). */
function toStringValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.trunc(value)) : String(value);
  }
  if (value && typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
    return value.toString();
  }
  throw new Error(`mpay: 不支持的类型 ${typeof value}`);
}

/** Check the response for a verification error; return a NeedVerifyError or null. */
function checkMPayError(body) {
  let obj;
  try {
    obj = JSON.parse(body.toString("utf8"));
  } catch (err) {
    return null;
  }
  if (obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, "code") && obj.code !== null) {
    // The JS version accepts code as a numeric string; Go's *int unmarshal fails in that case.
    return new NeedVerifyError({
      code: Number(obj.code),
      reason: obj.reason || "",
      verifyUrl: obj.verify_url || "",
    });
  }
  return null;
}

class Device {
  constructor(fields, client) {
    this.key = fields.key;
    this.id = fields.id;
    this.mcountTransactionId = fields.mcountTransactionId;
    this.transId = fields.transId;
    this.uniqueId = fields.uniqueId;
    this.udid = fields.udid;
    this.mac = fields.mac;
    this.ram = fields.ram;
    this.rom = fields.rom;
    this.extCi = fields.extCi;
    this.timestamp = fields.timestamp;
    this.client = client || null;
  }

  clone() {
    return new Device({ ...this }, this.client);
  }

  // Go-style method aliases
  Clone() { return this.clone(); }
  GenerateDevice(options = {}) { return this.generateDevice(options); }
  LoginEmail(email, password, options = {}) { return this.loginEmail(email, password, options); }
  LoginEmailMD5(email, passwordMD5, options = {}) { return this.loginEmailMD5(email, passwordMD5, options); }
  Guest(options = {}) { return this.guest(options); }
  AuthRealName(user, realName, idNum, options = {}) { return this.authRealName(user, realName, idNum, options); }

  // Go-style field accessors
  get Key() { return this.key; }
  get ID() { return this.id; }
  get MCountTransactionID() { return this.mcountTransactionId; }
  get TransID() { return this.transId; }
  get UniqueID() { return this.uniqueId; }
  get UDID() { return this.udid; }
  get Mac() { return this.mac; }
  get Ram() { return this.ram; }
  get Rom() { return this.rom; }
  get ExtCI() { return this.extCi; }
  get Timestamp() { return this.timestamp; }

  ensureClient() {
    if (!this.client) this.client = new MpayClient();
  }

  /** Call the MPay API to generate device credentials. */
  async generateDevice(options = {}) {
    this.ensureClient();
    const timestamp = Math.floor(Date.now() / 1000);

    const macHex = randomHex(16);
    const ursUDID = randomHex(20);
    const udid = randomHex(8);
    const extCI = randomHex(32);

    const uniqueID = `${crypto.randomUUID()}${timestamp}20114`;
    const mcountID = `${udid}_${timestamp}114_307044629`;
    const transID = `${udid}_${timestamp}10114_399039478`;

    const form = this.client.buildDeviceForm(
      macHex,
      ursUDID,
      uniqueID,
      udid,
      extCI,
      mcountID,
      transID,
      CONSTANTS,
    );

    const { body, status } = await this.client.postForm(DEVICE_ENDPOINT, form, options);
    if (status !== 201) {
      const verifyError = checkMPayError(body);
      if (verifyError) throw verifyError;
      throw new Error(`mpay: 生成设备失败 status=${status} body=${body.toString("utf8")}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(body.toString("utf8"));
    } catch (err) {
      throw new Error(`mpay: 解析设备响应失败: ${err.message}`);
    }
    const device = parsed.device || {};
    if (!device.id || !device.key) {
      throw new Error(`mpay: 设备响应缺少必要字段: ${body.toString("utf8")}`);
    }

    return new Device({
      key: device.key,
      id: device.id,
      mcountTransactionId: mcountID,
      transId: transID,
      uniqueId: uniqueID,
      udid,
      mac: macHex,
      ram: CONSTANTS.defaultRAMBytes,
      rom: CONSTANTS.defaultROMBytes,
      extCi: extCI,
      timestamp,
    }, this.client);
  }

  /** Log in with an email account. */
  async loginEmail(email, password, options = {}) {
    this.ensureClient();
    if (!email || !password) {
      throw new Error("mpay: email 与 password 不能为空");
    }
    const hash = md5(password).toString("hex");
    return this.loginEmailWithHash(email, hash, password, options);
  }

  /** Log in with an email account (password is a 32-character MD5). */
  async loginEmailMD5(email, passwordMD5, options = {}) {
    this.ensureClient();
    if (!email || !passwordMD5) {
      throw new Error("mpay: email 与 password_md5 不能为空");
    }
    const hash = String(passwordMD5).trim().toLowerCase();
    if (hash.length !== 32) {
      throw new Error(`mpay: password_md5 长度非法: ${passwordMD5}`);
    }
    try {
      hexDecode(hash);
    } catch (err) {
      throw new Error(`mpay: password_md5 非法: ${err.message}`);
    }
    return this.loginEmailWithHash(email, hash, hash, options);
  }

  async loginEmailWithHash(email, passwordHash, storedPassword, options = {}) {
    this.ensureClient();
    if (!email || !passwordHash) {
      throw new Error("mpay: email 与 password 不能为空");
    }
    const loginURL = `${DEVICE_ENDPOINT}/${this.id}/users?un=ZmdsbmIxMjNAMTYzLmNvbQ%3D%3D`;

    const payload = {
      username: email,
      password: passwordHash.toLowerCase(),
      unique_id: this.uniqueId,
    };
    const aesKey = hexDecode(this.key);
    const encrypted = aesEcbEncrypt(Buffer.from(JSON.stringify(payload), "utf8"), aesKey);

    const form = this.baseForm();
    form.set("opt_fields", CONSTANTS.defaultOptFields);
    form.set("params", hexEncode(encrypted));

    const { body, status } = await this.client.postForm(loginURL, form, options);
    if (status !== 200) {
      const verifyError = checkMPayError(body);
      if (verifyError) throw verifyError;
      throw new Error(`mpay: 邮箱登录失败 status=${status} body=${body.toString("utf8")}`);
    }
    const verifyError = checkMPayError(body);
    if (verifyError) throw verifyError;

    return this.decodeUser(body, false, email, storedPassword || passwordHash.toLowerCase());
  }

  /** Create a guest account. */
  async guest(options = {}) {
    this.ensureClient();
    const guestURL = `${DEVICE_ENDPOINT}/${this.id}/users/by_guest`;

    const aesKey = hexDecode(this.key);
    const encrypted = aesEcbEncrypt(Buffer.from("{}", "utf8"), aesKey);

    const form = this.baseForm();
    form.set("opt_fields", CONSTANTS.defaultOptFields);
    form.set("params", hexEncode(encrypted));

    const { body, status } = await this.client.postForm(guestURL, form, options);
    if (status !== 201) {
      const verifyError = checkMPayError(body);
      if (verifyError) throw verifyError;
      throw new Error(`mpay: 生成游客账号失败 status=${status} body=${body.toString("utf8")}`);
    }
    const verifyError = checkMPayError(body);
    if (verifyError) throw verifyError;

    return this.decodeUser(body, true, "", "");
  }

  /** Call the MPay API to complete real-name verification. */
  async authRealName(user, realName, idNum, options = {}) {
    this.ensureClient();
    if (!user) {
      throw new Error("mpay: user 不能为空");
    }
    if (!realName || !idNum) {
      throw new Error("mpay: realName 与 idNum 不能为空");
    }

    const form = this.baseForm();
    form.set("device_id", this.id);
    form.set("user_id", user.sauth.sdkuid);
    form.set("token", user.sauth.sessionid);
    form.set("realname", realName);
    form.set("id_region", "86");
    form.set("id_num", idNum);

    const { body, status } = await this.client.postForm(REAL_NAME_ENDPOINT, form, options);
    if (status !== 200) {
      const verifyError = checkMPayError(body);
      if (verifyError) throw verifyError;
      throw new Error(`mpay: 实名认证失败 status=${status} body=${body.toString("utf8")}`);
    }
    const verifyError = checkMPayError(body);
    if (verifyError) throw verifyError;
  }

  baseForm() {
    const form = new URLSearchParams();
    form.set("game_id", CONSTANTS.defaultGameID);
    form.set("gv", CONSTANTS.defaultGV);
    form.set("gvn", CONSTANTS.defaultGVN);
    form.set("cv", CONSTANTS.defaultCV);
    form.set("sv", CONSTANTS.defaultSV);
    form.set("app_type", CONSTANTS.defaultAppType);
    form.set("app_mode", CONSTANTS.defaultAppMode);
    form.set("app_channel", CONSTANTS.defaultAppChannel);
    form.set("mcount_app_key", CONSTANTS.defaultMCountAppKey);
    form.set("mcount_transaction_id", this.mcountTransactionId);
    form.set("transid", this.transId);
    form.set("_cloud_extra_base64", CONSTANTS.defaultCloudExtraBase64);
    form.set("sc", "1");
    return form;
  }

  decodeUser(body, isGuest, email, password) {    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch (err) {
      throw new Error(`mpay: 解析用户响应失败: ${err.message}`);
    }
    if (!payload.user) {
      throw new Error(`mpay: 响应缺少 user 字段: ${body.toString("utf8")}`);
    }

    if (!Object.prototype.hasOwnProperty.call(payload.user, "token")) {
      throw new Error(`mpay: user 缺少 token 字段: ${body.toString("utf8")}`);
    }
    const token = toStringValue(payload.user.token);
    if (!token) {
      throw new Error("mpay: 无法解析 token 字段");
    }

    if (!Object.prototype.hasOwnProperty.call(payload.user, "id")) {
      throw new Error(`mpay: user 缺少 id 字段: ${body.toString("utf8")}`);
    }
    const sdkuid = toStringValue(payload.user.id);
    if (!sdkuid) {
      throw new Error("mpay: 无法解析 id 字段");
    }

    if (Object.prototype.hasOwnProperty.call(payload.user, "udid")) {
      try {
        const parsedUdid = toStringValue(payload.user.udid);
        if (parsedUdid) this.udid = parsedUdid;
      } catch (err) {
        // 忽略无法解析的 udid
      }
    }

    return newUser(
      this.id,
      sdkuid,
      token,
      this.udid,
      this.mac,
      isGuest,
      this.ram,
      this.rom,
      email,
      password,
    );
  }
}

/** Generate a device using the specified client. */
function generateDeviceWithClient(client, options = {}) {
  const helper = new Device({}, client);
  return helper.generateDevice(options);
}

/** Generate a device using the default client. */
function generateDevice(options = {}) {
  return generateDeviceWithClient(new MpayClient(options.mpay), options);
}

module.exports = {
  Device,
  CONSTANTS,
  checkMPayError,
  toStringValue,
  generateDevice,
  generateDeviceWithClient,
  DEVICE_ENDPOINT,
  REAL_NAME_ENDPOINT,
};
