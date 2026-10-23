"use strict";

/**
 * Command-line entry point.
 * Usage: `node main.js <command> [args] [options]`.
 */

const examples = require("../examples/index.js");

const BOOLEAN_OPTIONS = new Set([
  "x19",
  "login",
  "insecure-tls",
  "no-interactive",
  "help",
  "version",
]);

function camelCase(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const raw = arg.slice(2);
    const eq = raw.indexOf("=");
    let key;
    let value;
    if (eq >= 0) {
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    } else {
      key = raw;
      if (BOOLEAN_OPTIONS.has(key)) {
        value = true;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        value = argv[i + 1];
        i += 1;
      } else {
        value = true;
      }
    }
    options[camelCase(key)] = value;
  }
  return options;
}

const COMMANDS = {
  login: { example: "login", description: "使用 Cookie 登录并输出用户信息" },
  "x19-login": { example: "login", description: "使用 X19 Cookie 登录", force: { x19: true } },
  demo: { example: "login", description: "login 的别名" },
  guest: { example: "guest", description: "生成 MPay 游客账号（可加 --login 直接登录）" },
  "search-room": { example: "searchRoom", description: "搜索在线大厅房间: <关键字>" },
  search: { example: "searchRoom", description: "search-room 的别名" },
  chat: { example: "chat", description: "连接聊天服务器并发送私聊: <目标UID> [消息]" },
  link: { example: "link", description: "连接 Link 服务器（公屏消息）" },
  domain: { example: "domain", description: "山头服邀请码流程: <邀请码>" },
  rental: { example: "rental", description: "租赁服流程: [租赁服号] [密码]" },
  "main-city": { example: "mainCity", description: "进入主城" },
  peauth: { example: "peauth", description: "使用 PeAuth 十六进制字符串登录" },
  "x19-crypto": { example: "x19Crypto", description: "解密 X19 请求/响应样本: [文件...]" },
  nickname: { example: "nickname", description: "根据昵称定位玩家: <昵称>" },
  transfer: { example: "transfer", description: "输出传输服务器列表" },
  refetch: { example: "refetch", description: "刷新全局配置与服务器列表" },
  purchase: { example: "purchase", description: "购买组件并查询下载地址: <组件ID>" },
  help: { example: null, description: "显示帮助" },
};

function helpText() {
  const lines = [
    "g79client JavaScript 版 - 网易我的世界 G79 客户端库",
    "",
    "用法:",
    "  node main.js <命令> [参数...] [选项...]",
    "",
    "命令:",
  ];
  for (const [name, info] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(14)} ${info.description}`);
  }
  lines.push(
    "",
    "选项:",
    "  --cookie <json>       直接提供 Cookie JSON",
    "  --cookie-file <path>  从文件读取 Cookie",
    "  --x19                 使用 X19 认证",
    "  --timeout <ms>        请求/连接超时",
    "  --client-key <key>    生成 AuthV2 时使用的 clientKey",
    "  --seconds <n>         chat/link 等待消息的秒数",
    "  --isp <id>            选择聊天服务器 ISP（0/10000/10010/10086）",
    "  --login               guest 生成后立即登录",
    "  --insecure-tls        跳过 TLS 证书校验（仅用于本地抓包环境）",
    "  --no-interactive      禁用交互式输入",
    "",
    "环境变量:",
    "  G79_COOKIE            默认 Cookie",
    "  G79_COOKIE_FILE       默认 Cookie 文件",
    "  G79_TLS_INSECURE=1    等价于 --insecure-tls",
    "",
    "示例:",
    "  node main.js x19-login --cookie-file cookie.json",
    "  node main.js search-room 12345 --cookie-file cookie.json",
    "  node main.js chat 2719712857 \"Hello\" --cookie-file cookie.json --seconds 30",
    "  node main.js x19-crypto src/tests/fixtures/x19_response.data",
  );
  return lines.join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  for (const key of ["timeout", "seconds", "isp"]) {
    if (typeof options[key] === "string" && /^\d+$/.test(options[key])) {
      options[key] = Number(options[key]);
    }
  }
  let commandName = options._.shift();
  if (!commandName || options.help) {
    console.log(helpText());
    return;
  }

  const command = COMMANDS[commandName];
  if (!command) {
    console.error(`未知命令: ${commandName}\n`);
    console.log(helpText());
    process.exitCode = 1;
    return;
  }
  if (!command.example) {
    console.log(helpText());
    return;
  }

  if (options.insecureTls) {
    process.env.G79_TLS_INSECURE = "1";
  }

  const merged = { ...options, ...(command.force || {}) };
  const example = examples[command.example];
  if (!example || typeof example.run !== "function") {
    throw new Error(`示例未实现: ${command.example}`);
  }
  await example.run(options._, merged);
}

module.exports = {
  main,
  parseArgs,
  helpText,
  COMMANDS,
};
