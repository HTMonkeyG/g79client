"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { readFirstFileFromZipData } = require("../utils/zip.js");

/** Build a ZIP containing a single file (for reader tests). */
function buildZip(name, content, method = 0) {
  const nameBuf = Buffer.from(name, "utf8");
  const data = Buffer.from(content);
  const compressed = method === 8 ? zlib.deflateRawSync(data) : data;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(0, 14); // crc (not validated by the reader)
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const localRecord = Buffer.concat([local, nameBuf, compressed]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);

  return Buffer.concat([localRecord, centralRecord, eocd]);
}

test("读取 stored 压缩的 ZIP 第一个文件", () => {
  const content = Buffer.from("{\"assets\":{\"vanilla.mcp\":{\"md5\":\"abc\"}}}");
  const zip = buildZip("manifest.json", content, 0);
  assert.deepEqual(readFirstFileFromZipData(zip), content);
});

test("读取 deflate 压缩的 ZIP 第一个文件", () => {
  const content = Buffer.from("hello ".repeat(100));
  const zip = buildZip("data.txt", content, 8);
  assert.deepEqual(readFirstFileFromZipData(zip), content);
});

/** Build a ZIP that forces ZIP64 fields (single file). */
function buildZip64(name, content) {
  const nameBuf = Buffer.from(name, "utf8");
  const data = Buffer.from(content);
  const compressed = zlib.deflateRawSync(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(45, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(0xffffffff, 18);
  local.writeUInt32LE(0xffffffff, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const localRecord = Buffer.concat([local, nameBuf, compressed]);

  const extra = Buffer.alloc(4 + 24);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(BigInt(data.length), 4);
  extra.writeBigUInt64LE(BigInt(compressed.length), 12);
  extra.writeBigUInt64LE(0n, 20);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(45, 4);
  central.writeUInt16LE(45, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(0xffffffff, 20);
  central.writeUInt32LE(0xffffffff, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(extra.length, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(0xffffffff, 42);
  const centralRecord = Buffer.concat([central, nameBuf, extra]);

  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);
  zip64Eocd.writeBigUInt64LE(44n, 4);
  zip64Eocd.writeUInt16LE(45, 12);
  zip64Eocd.writeUInt16LE(45, 14);
  zip64Eocd.writeUInt32LE(0, 16);
  zip64Eocd.writeUInt32LE(0, 20);
  zip64Eocd.writeBigUInt64LE(1n, 24);
  zip64Eocd.writeBigUInt64LE(1n, 32);
  zip64Eocd.writeBigUInt64LE(BigInt(centralRecord.length), 40);
  zip64Eocd.writeBigUInt64LE(BigInt(localRecord.length), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(BigInt(localRecord.length + centralRecord.length), 8);
  locator.writeUInt32LE(1, 16);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);

  return Buffer.concat([localRecord, centralRecord, zip64Eocd, locator, eocd]);
}

test("读取 ZIP64 归档的第一个文件", () => {
  const content = Buffer.from("zip64 content ".repeat(20));
  const zip = buildZip64("zip64.txt", content);
  assert.deepEqual(readFirstFileFromZipData(zip), content);
});

test("空 ZIP 抛出错误", () => {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  assert.throws(() => readFirstFileFromZipData(eocd), /zip archive is empty/);
});

test("不支持的压缩方式抛出错误", () => {
  const zip = buildZip("x", Buffer.from("x"), 99);
  assert.throws(() => readFirstFileFromZipData(zip), /unsupported compression method/);
});
