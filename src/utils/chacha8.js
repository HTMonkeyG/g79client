"use strict";

/**
 * ChaCha8 stream cipher implementation.
 *
 * Mirrors Go github.com/database64128/chacha8-go:
 * - 32-byte key
 * - 12-byte nonce (RFC 7539 layout: 32-bit counter + 96-bit nonce)
 * - 8 rounds (4 double rounds)
 *
 * Like Go's Cipher.XORKeyStream, an instance preserves its keystream position and counter
 * across process calls, so one instance can encrypt multiple messages consecutively.
 */

const KEY_SIZE = 32;
const NONCE_SIZE = 12;
const BLOCK_SIZE = 64;

// "expand 32-byte k"
const CONSTANTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function rotl(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function quarterRound(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl((x[d] ^ x[a]) >>> 0, 16);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl((x[b] ^ x[c]) >>> 0, 12);
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl((x[d] ^ x[a]) >>> 0, 8);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl((x[b] ^ x[c]) >>> 0, 7);
}

class ChaCha8 {
  /**
   * @param {Buffer|Uint8Array} key 32-byte key
   * @param {Buffer|Uint8Array} nonce 12-byte nonce
   * @param {number} rounds only 8 rounds are supported
   */
  constructor(key, nonce, rounds = 8) {
    const keyBuf = Buffer.from(key);
    const nonceBuf = Buffer.from(nonce);
    if (keyBuf.length !== KEY_SIZE) {
      throw new Error("ChaCha8: key length must be 32");
    }
    if (nonceBuf.length !== NONCE_SIZE) {
      throw new Error("ChaCha8: nonce length must be 12");
    }
    if (rounds !== 8) {
      throw new Error("ChaCha8: rounds must be 8");
    }

    this.key = Buffer.from(keyBuf);
    this.nonce = Buffer.from(nonceBuf);
    this.rounds = rounds;
    this.counter = 0;
    this._block = Buffer.alloc(BLOCK_SIZE);
    this._blockPos = BLOCK_SIZE;
  }

  /** Generate one 64-byte keystream block (increments the counter). */
  _nextBlock() {
    const state = new Uint32Array(16);
    state[0] = CONSTANTS[0];
    state[1] = CONSTANTS[1];
    state[2] = CONSTANTS[2];
    state[3] = CONSTANTS[3];
    for (let i = 0; i < 8; i += 1) {
      state[4 + i] = this.key.readUInt32LE(i * 4);
    }
    state[12] = this.counter >>> 0;
    for (let i = 0; i < 3; i += 1) {
      state[13 + i] = this.nonce.readUInt32LE(i * 4);
    }

    const x = new Uint32Array(state);
    const doubleRounds = this.rounds / 2;
    for (let i = 0; i < doubleRounds; i += 1) {
      quarterRound(x, 0, 4, 8, 12);
      quarterRound(x, 1, 5, 9, 13);
      quarterRound(x, 2, 6, 10, 14);
      quarterRound(x, 3, 7, 11, 15);
      quarterRound(x, 0, 5, 10, 15);
      quarterRound(x, 1, 6, 11, 12);
      quarterRound(x, 2, 7, 8, 13);
      quarterRound(x, 3, 4, 9, 14);
    }

    const out = this._block;
    for (let i = 0; i < 16; i += 1) {
      out.writeUInt32LE((x[i] + state[i]) >>> 0, i * 4);
    }
    this.counter = (this.counter + 1) >>> 0;
    this._blockPos = 0;
    return out;
  }

  /**
   * XOR-encrypt/decrypt data and return a new Buffer.
   * @param {Buffer|Uint8Array|string} data
   * @returns {Buffer}
   */
  process(data) {
    const input = Buffer.from(data);
    const out = Buffer.allocUnsafe(input.length);
    for (let i = 0; i < input.length; i += 1) {
      if (this._blockPos >= BLOCK_SIZE) {
        this._nextBlock();
      }
      out[i] = input[i] ^ this._block[this._blockPos];
      this._blockPos += 1;
    }
    return out;
  }

  /** Alias for process, for easier comparison with Go naming. */
  xorKeyStream(data) {
    return this.process(data);
  }

  /** Clone an instance with the same key and current stream position. */
  clone() {
    const copy = new ChaCha8(this.key, this.nonce, this.rounds);
    copy.counter = this.counter;
    this._block.copy(copy._block);
    copy._blockPos = this._blockPos;
    return copy;
  }
}

// Fixed nonce used by NetEase chat / Link services.
const NETEASE_NONCE = Buffer.from("163 NetEase\n", "latin1");

/** Create a ChaCha8 instance using NetEase's fixed nonce. */
function newNeteaseChaCha(key) {
  return new ChaCha8(key, NETEASE_NONCE, 8);
}

/** Expose a simple stream-processing helper. */
function chacha8Process(key, nonce, data, rounds = 8) {
  return new ChaCha8(key, nonce, rounds).process(data);
}

module.exports = {
  ChaCha8,
  KEY_SIZE,
  NONCE_SIZE,
  BLOCK_SIZE,
  NETEASE_NONCE,
  newNeteaseChaCha,
  chacha8Process,
  // Go-style aliases
  ChaChaEngine: ChaCha8,
  NewChaChaEngine: (key, nonce, rounds = 8) => new ChaCha8(key, nonce, rounds),
  NewNeteaseChaCha: newNeteaseChaCha,
};
