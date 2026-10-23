"use strict";

/** Random utilities (mirrors Go account/mpay/random.go). */

const { randomBytes: nodeRandomBytes } = require("node:crypto");

function randomBytes(length) {
  if (length <= 0) return Buffer.alloc(0);
  return nodeRandomBytes(length);
}

function randomHex(byteLen) {
  return randomBytes(byteLen).toString("hex");
}

function randomMacLowerCase() {
  const bytes = randomBytes(6);
  bytes[0] = (bytes[0] | 0x02) & 0xfe;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(":");
}

module.exports = {
  randomBytes,
  randomHex,
  randomMacLowerCase,
};
