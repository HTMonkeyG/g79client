'use strict';

/**
 * MPay 账号模块（对应 Go 版本 account/mpay）。
 */

const clientModule = require('./client');
const deviceModule = require('./device');
const userModule = require('./user');
const randomModule = require('./random');
const { NeedVerifyError } = require('./error');

/** 创建 MPay 客户端。 */
function newClient(options = {}) {
  return new clientModule.MpayClient(options);
}

// 让客户端实例也可以直接生成设备，对应 Go 的 (*mpay.Client).GenerateDevice。
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
