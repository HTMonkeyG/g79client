'use strict';

/** 通用错误类型。 */
class G79Error extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || 'G79Error';
    if (options.code !== undefined) this.code = options.code;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** 接口返回非 0 code 时抛出的错误。 */
class ApiError extends G79Error {
  constructor(code, message, details = '') {
    super(message || `接口返回错误 (code: ${code})`, { name: 'ApiError', code, details });
    this.apiCode = code;
  }
}

/** MPay 需要额外验证时抛出的错误（对应 Go account/mpay.NeedVerifyError）。 */
class NeedVerifyError extends G79Error {
  constructor({ code, reason, verifyUrl } = {}) {
    const url = verifyUrl || '';
    const suffix = url ? ` verify_url=${url}` : '';
    super(`mpay: 需要验证 code=${code} reason=${reason}${suffix}`, {
      name: 'NeedVerifyError',
      code,
    });
    this.reason = reason || '';
    this.verifyUrl = url;
  }

  /** 兼容 Go 字段名。 */
  get verifyURL() {
    return this.verifyUrl;
  }
}

module.exports = {
  G79Error,
  ApiError,
  NeedVerifyError,
};
