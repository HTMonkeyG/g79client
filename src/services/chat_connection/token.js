'use strict';

/**
 * 从用户 token 推导聊天握手使用的 AES 密钥。
 * 对应 Go 版本 service/chat_connection/token.go。
 */

const {
  hexDecode,
  base64Decode,
  base64RawDecode,
} = require('../../utils/bytes');

function decodeToken(token) {
  const seen = new Set();
  const candidates = [];

  const appendCandidate = (buf) => {
    if (!buf) return;
    const key = buf.toString('hex');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(Buffer.from(buf));
  };

  try { appendCandidate(hexDecode(token)); } catch (err) { /* 忽略 */ }
  try { appendCandidate(base64Decode(token)); } catch (err) { /* 忽略 */ }
  try { appendCandidate(base64RawDecode(token)); } catch (err) { /* 忽略 */ }
  appendCandidate(Buffer.from(String(token), 'utf8'));

  for (const candidate of candidates) {
    const len = candidate.length;
    if (len === 16 || len === 24 || len === 32) {
      return candidate;
    }
  }

  throw new Error(`chat_connection: 无法根据 token 推导有效密钥长度 (${String(token).length})`);
}

module.exports = {
  decodeToken,
};
