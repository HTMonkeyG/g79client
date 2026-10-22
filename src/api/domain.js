'use strict';

/**
 * 山头服（Domain Server）相关接口（对应 Go 版本的 domain_server_*.go）。
 */

const { callJSON } = require('./common');
const { G79Error } = require('../errors');

function requireSid(sid, methodName) {
  if (String(sid ?? '').trim() === '') {
    throw new G79Error(`${methodName}: sid 不能为空`);
  }
  return sid;
}

/** 移除指定 sid 的他服记录。 */
async function deleteOtherDomainServer(sid) {
  requireSid(sid, 'DeleteOtherDomainServer');
  return callJSON(this, {
    api: '/domain-server/del-other-server',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: '删除他服响应',
  });
}

/** 拉取山头服详情。 */
async function getDomainServerDetail(sid) {
  requireSid(sid, 'GetDomainServerDetail');
  return callJSON(this, {
    api: '/domain-server/get-server-detail',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: '山头服详情响应',
  });
}

/** 拉取当前账号加入的他服列表。 */
async function getOtherDomainServers() {
  return callJSON(this, {
    api: '/domain-server/get-other-servers',
    base: this.releaseJSON.apiGatewayUrl,
    rawBody: '{}',
    acceptEncoding: true,
    errorLabel: '山头服他服列表',
  });
}

/** 使用邀请码加入山头服。 */
async function joinDomainServerWithInviteCode(code) {
  if (String(code ?? '').trim() === '') {
    throw new G79Error('JoinDomainServerWithInviteCode: code 不能为空');
  }
  return callJSON(this, {
    api: '/domain-server/join-server-with-invite-code',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { code: String(code) },
    acceptEncoding: true,
    errorLabel: '山头服邀请码加入响应',
  });
}

/** 申请进入指定山头服。 */
async function requestEnterDomainServer(sid) {
  requireSid(sid, 'RequestEnterDomainServer');
  return callJSON(this, {
    api: '/domain-server/req-enter-domain-server',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: '进入山头服响应',
  });
}

/** 申请退出指定山头服。 */
async function requestLeaveDomainServer(sid) {
  requireSid(sid, 'RequestLeaveDomainServer');
  return callJSON(this, {
    api: '/domain-server/req-leave-domain-server',
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: '退出山头服响应',
  });
}

module.exports = {
  deleteOtherDomainServer,
  getDomainServerDetail,
  getOtherDomainServers,
  joinDomainServerWithInviteCode,
  requestEnterDomainServer,
  requestLeaveDomainServer,
};
