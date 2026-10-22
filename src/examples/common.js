'use strict';

/** 示例脚本共用的辅助函数。 */

const fs = require('node:fs');
const readline = require('node:readline');

/** 从参数或环境变量读取 Cookie。 */
function getCookie(options = {}) {
  if (options.cookie) return String(options.cookie);
  if (process.env.G79_COOKIE) return process.env.G79_COOKIE;
  if (process.env.G79_COOKIE_FILE) {
    return fs.readFileSync(process.env.G79_COOKIE_FILE, 'utf8').trim();
  }
  if (options.cookieFile) {
    return fs.readFileSync(String(options.cookieFile), 'utf8').trim();
  }
  throw new Error(
    '缺少 Cookie：请使用 --cookie \'<json>\'、--cookie-file <path>，'
    + '或设置环境变量 G79_COOKIE / G79_COOKIE_FILE。',
  );
}

/** 读取 stdin 的一行（用于需要人工验证的流程）。 */
function readLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  getCookie,
  readLine,
  pretty,
  sleep,
};
