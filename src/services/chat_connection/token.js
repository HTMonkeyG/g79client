"use strict";

/**
 * Derive the AES key used for the chat handshake from the user token.
 * Mirrors Go service/chat_connection/token.go.
 */

const {
  hexDecode,
  base64Decode,
  base64RawDecode,
} = require("../../utils/bytes.js");

function decodeToken(token) {
  const seen = new Set();
  const candidates = [];

  const appendCandidate = (buf) => {
    if (!buf) return;
    const key = buf.toString("hex");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(Buffer.from(buf));
  };

  try { appendCandidate(hexDecode(token)); } catch (err) { /* ignore */ }
  try { appendCandidate(base64Decode(token)); } catch (err) { /* ignore */ }
  try { appendCandidate(base64RawDecode(token)); } catch (err) { /* ignore */ }
  appendCandidate(Buffer.from(String(token), "utf8"));

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
