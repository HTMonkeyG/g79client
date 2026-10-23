"use strict";

/** Link connection example (mirrors Go legacy-go/example/link). */

const readline = require("node:readline");

const g79client = require("../src/index.js");
const { login } = require("./login.js");
const { pretty } = require("./common.js");

function printCommonPush(push) {
  if (push.type === "GlobalMessage" && push.payload) {
    console.log("[推送]", pretty(push.payload));
  } else {
    console.log("[公共频道]", pretty(push));
  }
}

function printGlobalMessages(json) {
  const msgs = json && json.entity && Array.isArray(json.entity.msgs) ? json.entity.msgs : [];
  for (const msg of msgs) {
    console.log("[历史]", pretty(msg));
  }
}

async function run(args = [], options = {}) {
  const client = await login(options);
  const svc = await g79client.linkConnection.newLinkConnectionService(client);

  console.log("尝试建立 Link 连接...");
  const conn = await svc.dial({ timeoutMs: options.timeoutMs ?? options.timeout ?? 180000 });
  console.log("连接成功。");

  await conn.SendGameStart(null).catch((err) => console.log("发送 GameStart 失败:", err.message));
  await conn.RequestChatDumpState().catch((err) => console.log("请求 DumpState 失败:", err.message));
  await conn.RequestChatConnectState().catch((err) => console.log("请求 ConnectState 失败:", err.message));
  await conn.SendChatOnline().catch((err) => console.log("发送 Online 失败:", err.message));
  await conn.FetchGlobalMessages(50).catch((err) => console.log("拉取公共消息失败:", err.message));

  const offMessage = conn.OnMessage((msg) => {
    console.log(`收到原始消息 [${msg.method}]:`);
    console.log(pretty(msg.json ?? msg.payloadText));
    if (msg.method === "GetGlobalMessages" && msg.json) printGlobalMessages(msg.json);
  });
  const offPush = conn.OnCommonPush(printCommonPush);

  const seconds = Number(options.seconds ?? 20);
  const timer = setTimeout(() => conn.Close(), seconds * 1000);

  // Interactive world-chat messages (only enabled on a TTY)
  let rl = null;
  if (process.stdin.isTTY && !options.noInteractive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on("line", async (line) => {
      const text = line.trim();
      if (!text) return;
      try {
        await conn.SendGlobalMessage(text);
        console.log("已发送:", text);
      } catch (err) {
        console.log("发送失败:", err.message);
      }
    });
  }

  await new Promise((resolve) => {
    const waitTimer = setTimeout(resolve, seconds * 1000);
    conn.events.once("close", () => {
      clearTimeout(waitTimer);
      resolve();
    });
  });

  clearTimeout(timer);
  offMessage();
  offPush();
  if (rl) rl.close();
  await conn.Close();
  if (conn.Err()) console.log("连接结束:", conn.Err().message);
  return conn;
}

module.exports = { run };
