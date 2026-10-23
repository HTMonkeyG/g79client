#!/usr/bin/env node
"use strict";

/**
 * g79client JavaScript entry point.
 *
 * - As a library:  const g79client = require("./main.js");
 * - As a CLI:      node main.js <command> [args] [options]
 */

module.exports = require("./src/index.js");

if (require.main === module) {
  const { main } = require("./src/cli.js");
  main(process.argv.slice(2)).catch((err) => {
    console.error("错误:", err && err.message ? err.message : err);
    if (process.env.G79_DEBUG && err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  });
}
