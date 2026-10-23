"use strict";

/**
 * MPay HTTP client (mirrors Go account/mpay/client.go).
 */

const { HttpClient } = require("../../http_util.js");

const DEFAULT_BASE_URL = "https://service.mkey.163.com";
const DEFAULT_USER_AGENT = "com.netease.x19/840268037 NeteaseMobileGame/a5.2.0 (23117RK66C;32)";
const DEFAULT_TIMEOUT_MS = 5000;

class MpayClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.httpClient = options.httpClient || new HttpClient({
      timeoutMs: this.timeoutMs,
      insecureTLS: options.insecureTLS,
    });
  }

  setUserAgent(userAgent) {
    if (userAgent) this.userAgent = userAgent;
  }

  // Go-style aliases
  SetUserAgent(userAgent) {
    this.setUserAgent(userAgent);
  }

  /** Send an application/x-www-form-urlencoded request. */
  async postForm(path, form, options = {}) {
    const body = form instanceof URLSearchParams ? form.toString() : String(form);
    return this.postEncoded(path, body, options);
  }

  /** Send an already encoded form string. */
  async postEncoded(path, payload, options = {}) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (this.userAgent) headers["User-Agent"] = this.userAgent;
    if (options.headers) Object.assign(headers, options.headers);

    const res = await this.httpClient.request(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: payload,
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
      signal: options.signal,
    });
    return { body: res.body, status: res.statusCode };
  }

  /** Build the device registration form. */
  buildDeviceForm(mac, ursUDID, uniqueID, udid, extCI, mcountID, transID, constants) {
    const form = new URLSearchParams();
    form.set("mac", mac);
    form.set("urs_udid", ursUDID);
    form.set("init_urs_device", "0");
    form.set("unique_id", uniqueID);
    form.set("brand", "Redmi");
    form.set("device_name", "MuMu");
    form.set("device_type", "tablet");
    form.set("device_model", "23117RK66C");
    form.set("resolution", "900*1600");
    form.set("system_name", "Android");
    form.set("system_version", "12");
    form.set("udid", udid);
    form.set("app_channel", constants.defaultAppChannel);
    form.set("ext_ci", extCI);
    form.set("ci_code", "3");
    form.set("game_id", constants.defaultGameID);
    form.set("gv", constants.defaultGV);
    form.set("gvn", constants.defaultGVN);
    form.set("cv", constants.defaultCV);
    form.set("sv", constants.defaultSV);
    form.set("app_type", constants.defaultAppType);
    form.set("app_mode", constants.defaultAppMode);
    form.set("mcount_app_key", constants.defaultMCountAppKey);
    form.set("mcount_transaction_id", mcountID);
    form.set("transid", transID);
    form.set("_cloud_extra_base64", constants.defaultCloudExtraBase64);
    return form;
  }

  ensureResponse(status, expect, body, context) {
    if (status !== expect) {
      throw new Error(`mpay: ${context}失败 status=${status} body=${body.toString("utf8")}`);
    }
  }
}

module.exports = {
  MpayClient,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_TIMEOUT_MS,
};
