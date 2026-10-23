"use strict";

/** Generic error type. */
class G79Error extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || "G79Error";
    if (options.code !== undefined) this.code = options.code;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** Error thrown when an API returns a non-zero code. */
class ApiError extends G79Error {
  constructor(code, message, details = "") {
    super(message || `接口返回错误 (code: ${code})`, { name: "ApiError", code, details });
    this.apiCode = code;
  }
}

/** Error thrown when MPay requires additional verification (mirrors Go account/mpay.NeedVerifyError). */
class NeedVerifyError extends G79Error {
  constructor({ code, reason, verifyUrl } = {}) {
    const url = verifyUrl || "";
    const suffix = url ? ` verify_url=${url}` : "";
    super(`mpay: 需要验证 code=${code} reason=${reason}${suffix}`, {
      name: "NeedVerifyError",
      code,
    });
    this.reason = reason || "";
    this.verifyUrl = url;
  }

  /** Compatibility accessor for the Go field name. */
  get verifyURL() {
    return this.verifyUrl;
  }
}

module.exports = {
  G79Error,
  ApiError,
  NeedVerifyError,
};
