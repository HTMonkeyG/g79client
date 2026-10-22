'use strict';

/** 聊天服务器示例（对应 Go legacy-go/example/chat）。 */

const g79client = require('../index');
const { login } = require('./login');
const { sleep } = require('./common');

async function run(args = [], options = {}) {
  const targetUid = args[0] || options.uid;
  const words = args[1] || options.words || 'Hello, world!';
  if (!targetUid) {
    throw new Error('用法: node main.js chat <目标UID> [消息内容] [--cookie <json>]');
  }

  const client = await login(options);
  console.log('当前昵称:', client.userDetail?.name ?? '');

  const svc = await g79client.chatConnection.newChatConnectionService(client);
  const endpoint = await svc.selectServer(Number(options.isp || 0));
  console.log(`准备连接聊天服务器: ${endpoint.host}:${endpoint.port}`);

  const conn = await svc.dialWithEndpoint(endpoint, { timeoutMs: options.timeoutMs ?? options.timeout ?? 10000 });
  console.log('连接成功，发送消息...');

  const sn = await conn.ChatTo(Number(targetUid), words);
  console.log('发送消息: SN=', sn);

  const seconds = Number(options.seconds ?? 20);
  const timer = setTimeout(() => conn.Close(), seconds * 1000);
  try {
    for await (const msg of conn.Messages()) {
      console.log(`收到消息: SN=${msg.sequence}, CMD=${msg.command}, Data=${msg.payload.toString('utf8')}`);
    }
  } finally {
    clearTimeout(timer);
    await conn.Close();
  }

  await sleep(0);
  if (conn.Err()) console.log('连接结束:', conn.Err().message);
  return conn;
}

module.exports = { run };
