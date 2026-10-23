"use strict";

/**
 * Domain server APIs (mirrors Go domain_server_*.go).
 */

const { callJSON } = require("./common.js");
const { G79Error } = require("../errors.js");

function requireSid(sid, methodName) {
  if (String(sid ?? "").trim() === "") {
    throw new G79Error(`${methodName}: sid 不能为空`);
  }
  return sid;
}

/** Remove the other-server record for the specified sid. */
async function deleteOtherDomainServer(sid) {
  requireSid(sid, "DeleteOtherDomainServer");
  return callJSON(this, {
    api: "/domain-server/del-other-server",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: "删除他服响应",
  });
}

/** Fetch domain server details. */
async function getDomainServerDetail(sid) {
  requireSid(sid, "GetDomainServerDetail");
  return callJSON(this, {
    api: "/domain-server/get-server-detail",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: "山头服详情响应",
  });
}

/** Fetch the list of other servers the current account has joined. */
async function getOtherDomainServers() {
  return callJSON(this, {
    api: "/domain-server/get-other-servers",
    base: this.releaseJSON.apiGatewayUrl,
    rawBody: "{}",
    acceptEncoding: true,
    errorLabel: "山头服他服列表",
  });
}

/** Join a domain server with an invite code. */
async function joinDomainServerWithInviteCode(code) {
  if (String(code ?? "").trim() === "") {
    throw new G79Error("JoinDomainServerWithInviteCode: code 不能为空");
  }
  return callJSON(this, {
    api: "/domain-server/join-server-with-invite-code",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { code: String(code) },
    acceptEncoding: true,
    errorLabel: "山头服邀请码加入响应",
  });
}

/** Request to enter the specified domain server. */
async function requestEnterDomainServer(sid) {
  requireSid(sid, "RequestEnterDomainServer");
  return callJSON(this, {
    api: "/domain-server/req-enter-domain-server",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: "进入山头服响应",
  });
}

/** Request to leave the specified domain server. */
async function requestLeaveDomainServer(sid) {
  requireSid(sid, "RequestLeaveDomainServer");
  return callJSON(this, {
    api: "/domain-server/req-leave-domain-server",
    base: this.releaseJSON.apiGatewayUrl,
    payload: { sid: String(sid) },
    acceptEncoding: true,
    errorLabel: "退出山头服响应",
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
