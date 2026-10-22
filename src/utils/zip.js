'use strict';

/**
 * 极简 ZIP 读取器：只读取归档中的第一个文件。
 * 对应 Go 版本 globals.go 中的 readFirstFileFromZipData。
 *
 * 支持：
 * - stored（0）与 deflate（8）压缩方式
 * - ZIP64（大文件 / 强制 ZIP64 的归档）
 */

const zlib = require('node:zlib');

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;

function findEOCD(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  return -1;
}

function readUInt64LE(buf, offset, label) {
  if (offset + 8 > buf.length) {
    throw new Error(`zip: truncated ${label}`);
  }
  const value = buf.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`zip: ${label} exceeds safe integer range`);
  }
  return Number(value);
}

/** 解析 EOCD（含 ZIP64 扩展）。 */
function readEOCDInfo(buf, eocd) {
  let entries = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  let cdSize = buf.readUInt32LE(eocd + 12);

  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIGNATURE) {
    const locator = eocd - 20;
    const zip64Offset = readUInt64LE(buf, locator + 8, 'zip64 eocd offset');
    if (zip64Offset + 56 > buf.length || buf.readUInt32LE(zip64Offset) !== ZIP64_EOCD_SIGNATURE) {
      throw new Error('zip: invalid zip64 end of central directory');
    }
    entries = readUInt64LE(buf, zip64Offset + 32, 'entry count');
    cdSize = readUInt64LE(buf, zip64Offset + 40, 'central directory size');
    cdOffset = readUInt64LE(buf, zip64Offset + 48, 'central directory offset');
  }

  return { entries, cdOffset, cdSize };
}

/** 读取 ZIP 数据中的第一个文件，返回解压后的 Buffer。 */
function readFirstFileFromZipData(data) {
  const buf = Buffer.from(data);
  if (buf.length < 22) {
    throw new Error('zip: file too short');
  }

  const eocd = findEOCD(buf);
  if (eocd < 0) {
    throw new Error('zip: end of central directory not found');
  }

  const { entries, cdOffset, cdSize } = readEOCDInfo(buf, eocd);
  if (entries === 0) {
    throw new Error('zip archive is empty');
  }
  if (cdOffset + 46 > buf.length || (cdSize > 0 && cdOffset + cdSize > buf.length)) {
    throw new Error('zip: corrupt central directory');
  }
  if (buf.readUInt32LE(cdOffset) !== CENTRAL_SIGNATURE) {
    throw new Error('zip: invalid central directory signature');
  }

  const method = buf.readUInt16LE(cdOffset + 10);
  let compressedSize = buf.readUInt32LE(cdOffset + 20);
  let uncompressedSize = buf.readUInt32LE(cdOffset + 24);
  const nameLength = buf.readUInt16LE(cdOffset + 28);
  const extraLength = buf.readUInt16LE(cdOffset + 30);
  let localOffset = buf.readUInt32LE(cdOffset + 42);

  // ZIP64 扩展字段：仅当 32 位字段为全 1 时才包含对应的 64 位值。
  const extraStart = cdOffset + 46 + nameLength;
  const extraEnd = Math.min(extraStart + extraLength, buf.length);
  let pos = extraStart;
  while (pos + 4 <= extraEnd) {
    const id = buf.readUInt16LE(pos);
    const size = buf.readUInt16LE(pos + 2);
    const dataStart = pos + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > extraEnd) break;

    if (id === ZIP64_EXTRA_ID) {
      let offset = dataStart;
      if (uncompressedSize === 0xffffffff) {
        uncompressedSize = readUInt64LE(buf, offset, 'uncompressed size');
        offset += 8;
      }
      if (compressedSize === 0xffffffff) {
        compressedSize = readUInt64LE(buf, offset, 'compressed size');
        offset += 8;
      }
      if (localOffset === 0xffffffff) {
        localOffset = readUInt64LE(buf, offset, 'local header offset');
        offset += 8;
      }
    }
    pos = dataEnd;
  }

  if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
    throw new Error('zip: missing zip64 extended information');
  }
  if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error('zip: invalid local file header');
  }

  const localNameLength = buf.readUInt16LE(localOffset + 26);
  const localExtraLength = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > buf.length) {
    throw new Error('zip: truncated file data');
  }

  const compressed = buf.subarray(dataStart, dataEnd);
  if (method === 0) {
    return Buffer.from(compressed);
  }
  if (method === 8) {
    const out = zlib.inflateRawSync(compressed);
    if (uncompressedSize !== 0 && out.length !== uncompressedSize) {
      // 不视为致命错误：部分生成器会写错 uncompressedSize。
      return out;
    }
    return out;
  }
  throw new Error(`zip: unsupported compression method ${method}`);
}

module.exports = {
  readFirstFileFromZipData,
};
