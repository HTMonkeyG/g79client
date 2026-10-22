'use strict';

/** 异步工具：异步队列（模拟 Go channel）与超时控制。 */

class AsyncQueue {
  /**
   * @param {object} [options]
   * @param {number} [options.capacity=0] 0 表示无容量限制
   * @param {boolean} [options.dropWhenFull=false] 队列满时是否丢弃新元素
   */
  constructor(options = {}) {
    this.capacity = options.capacity || 0;
    this.dropWhenFull = Boolean(options.dropWhenFull);
    this.items = [];
    this.waiters = [];
    this.closed = false;
  }

  /** 入队；返回是否成功。 */
  push(value) {
    if (this.closed) return false;
    if (this.capacity > 0 && this.items.length >= this.capacity) {
      if (this.dropWhenFull) return false;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.items.push(value);
    }
    return true;
  }

  /** 关闭队列；已入队的元素仍可被读取。 */
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  /** 读取下一个元素。 */
  next() {
    if (this.items.length > 0) {
      return Promise.resolve({ value: this.items.shift(), done: false });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiters.push({ resolve });
    });
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => this.next(),
      return: () => Promise.resolve({ value: undefined, done: true }),
    };
  }
}

/** 延时。 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 为 Promise 增加超时与 AbortSignal 支持。
 * @param {Promise} promise
 * @param {number} ms
 * @param {AbortSignal|null} [signal]
 * @param {string} [message]
 */
function withTimeout(promise, ms, signal = null, message = 'operation timed out') {
  let timer = null;
  let abortHandler = null;
  const racers = [promise];

  if (ms && ms > 0) {
    racers.push(new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${message} (${ms}ms)`)), ms);
    }));
  }

  if (signal) {
    racers.push(new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason || new Error('aborted'));
        return;
      }
      abortHandler = () => reject(signal.reason || new Error('aborted'));
      signal.addEventListener('abort', abortHandler, { once: true });
    }));
  }

  if (racers.length === 1) return promise;

  return Promise.race(racers).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
  });
}

/** 将 socket 的 close/error 事件转换为 Promise。 */
function waitForEvent(emitter, event, errorEvents = ['error', 'close']) {
  return new Promise((resolve, reject) => {
    const onEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const cleanup = () => {
      emitter.removeListener(event, onEvent);
      for (const name of errorEvents) emitter.removeListener(name, onError);
    };
    emitter.once(event, onEvent);
    for (const name of errorEvents) emitter.once(name, onError);
  });
}

module.exports = {
  AsyncQueue,
  delay,
  withTimeout,
  waitForEvent,
};
