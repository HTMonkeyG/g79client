#!/usr/bin/env node
'use strict';

/**
 * g79client JavaScript 版入口。
 *
 * - 作为库使用:  const g79client = require('./main.js');
 * - 作为命令行:  node main.js <命令> [参数] [选项]
 */

module.exports = require('./src');

if (require.main === module) {
  const { main } = require('./src/cli');
  main(process.argv.slice(2)).catch((err) => {
    console.error('错误:', err && err.message ? err.message : err);
    if (process.env.G79_DEBUG && err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  });
}
