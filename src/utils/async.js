"use strict";

/** Async utilities: async queue (Go channel replacement) and timeout control. */

class AsyncQueue {
  /**
   * @param {object} [options]
   * @param {number} [options.capacity=0] 0 means unlimited
   * @param {boolean} [options.dropWhenFull=false] Whether to drop new items when the queue is full
   */
  constructor(options = {}) {
    this.capacity = options.capacity || 0;
    this.dropWhenFull = Boolean(options.dropWhenFull);
    this.items = [];
    this.waiters = [];
    this.closed = false;
  }

  /** Enqueue; returns whether it succeeded. */
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

  /** Close the queue; already enqueued items can still be read. */
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  /** Read the next item. */
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

/** Delay. */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add timeout and AbortSignal support to a Promise.
 * @param {Promise} promise
 * @param {number} ms
 * @param {AbortSignal|null} [signal]
 * @param {string} [message]
 */
function withTimeout(promise, ms, signal = null, message = "operation timed out") {
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
        reject(signal.reason || new Error("aborted"));
        return;
      }
      abortHandler = () => reject(signal.reason || new Error("aborted"));
      signal.addEventListener("abort", abortHandler, { once: true });
    }));
  }

  if (racers.length === 1) return promise;

  return Promise.race(racers).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  });
}

/** Convert socket close/error events to a Promise. */
function waitForEvent(emitter, event, errorEvents = ["error", "close"]) {
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
