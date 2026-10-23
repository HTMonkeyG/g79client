"use strict";

/**
 * MPay account module (mirrors Go account/mpay).
 */

const clientModule = require("./client.js");
const deviceModule = require("./device.js");
const userModule = require("./user.js");
const randomModule = require("./random.js");
const { NeedVerifyError } = require("./error.js");

/** Create an MPay client. */
function newClient(options = {}) {
  return new clientModule.MpayClient(options);
}

// Allow a client instance to generate a device directly (mirrors Go (*mpay.Client).GenerateDevice).
clientModule.MpayClient.prototype.generateDevice = function generateDeviceMethod(options = {}) {
  return deviceModule.generateDeviceWithClient(this, options);
};

module.exports = {
  ...clientModule,
  ...deviceModule,
  ...userModule,
  ...randomModule,
  NeedVerifyError,
  newClient,
  NewClient: newClient,
  Client: clientModule.MpayClient,
  GenerateDevice: deviceModule.generateDevice,
};
