'use strict';

/**
 * ChaCha8 流密码实现。
 *
 * 对应 Go 版本的 github.com/database64128/chacha8-go：
 * - 32 字节密钥
 * - 12 字节 nonce（RFC 7539 布局：32 位计数器 + 96 位 nonce）
 * - 8 轮（4 次双轮）
 *
 * 与 Go 的 Cipher.XORKeyStream 相同，实例会在多次 process 调用之间
 * 保持密钥流位置和计数器状态，因此同一个实例可以连续加密多条消息。
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
   * @param {Buffer|Uint8Array} key 32 字节密钥
   * @param {Buffer|Uint8Array} nonce 12 字节 nonce
   * @param {number} rounds 只支持 8 轮
   */
  constructor(key, nonce, rounds = 8) {
    const keyBuf = Buffer.from(key);
    const nonceBuf = Buffer.from(nonce);
    if (keyBuf.length !== KEY_SIZE) {
      throw new Error('ChaCha8: key length must be 32');
    }
    if (nonceBuf.length !== NONCE_SIZE) {
      throw new Error('ChaCha8: nonce length must be 12');
    }
    if (rounds !== 8) {
      throw new Error('ChaCha8: rounds must be 8');
    }

    this.key = Buffer.from(keyBuf);
    this.nonce = Buffer.from(nonceBuf);
    this.rounds = rounds;
    this.counter = 0;
    this._block = Buffer.alloc(BLOCK_SIZE);
    this._blockPos = BLOCK_SIZE;
  }

  /** 生成一个 64 字节密钥流块（counter 递增）。 */
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
   * 对数据做 XOR 加/解密，返回值是新 Buffer。
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

  /** process 的别名，便于与 Go 命名对照。 */
  xorKeyStream(data) {
    return this.process(data);
  }

  /** 复制一个具有相同密钥和当前流位置的实例。 */
  clone() {
    const copy = new ChaCha8(this.key, this.nonce, this.rounds);
    copy.counter = this.counter;
    this._block.copy(copy._block);
    copy._blockPos = this._blockPos;
    return copy;
  }
}

// 网易聊天 / Link 服务使用的固定 nonce。
const NETEASE_NONCE = Buffer.from('163 NetEase\n', 'latin1');

/** 创建使用网易固定 nonce 的 ChaCha8 实例。 */
function newNeteaseChaCha(key) {
  return new ChaCha8(key, NETEASE_NONCE, 8);
}

/** 暴露一个简单的流式处理函数。 */
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
  // Go 风格别名
  ChaChaEngine: ChaCha8,
  NewChaChaEngine: (key, nonce, rounds = 8) => new ChaCha8(key, nonce, rounds),
  NewNeteaseChaCha: newNeteaseChaCha,
};
