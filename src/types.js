'use strict';

/**
 * 处理网易接口中“同一字段可能是字符串/数字/布尔/空值”的情况。
 * 对应 Go 版本的 Uncertain 类型（types.go）。
 */

const TRUE_STRINGS = new Set(['1', 't', 'T', 'TRUE', 'true', 'True']);

class Uncertain {
  constructor(raw = '', quoted = false) {
    this.raw = raw === null || raw === undefined ? '' : String(raw);
    this.quoted = Boolean(quoted);
  }

  static from(value) {
    if (value instanceof Uncertain) return value.clone();
    if (value === null || value === undefined) return new Uncertain('', true);
    if (typeof value === 'string') return new Uncertain(value, true);
    return new Uncertain(String(value), false);
  }

  clone() {
    return new Uncertain(this.raw, this.quoted);
  }

  toString() {
    return this.raw;
  }

  valueOf() {
    return this.raw;
  }

  int64() {
    if (this.raw === '') return 0;
    return /^[+-]?\d+$/.test(this.raw) ? Number.parseInt(this.raw, 10) : 0;
  }

  float64() {
    if (this.raw === '') return 0;
    const value = Number.parseFloat(this.raw);
    return Number.isNaN(value) ? 0 : value;
  }

  bool() {
    if (this.raw === '') return false;
    return TRUE_STRINGS.has(this.raw);
  }

  toJSON() {
    if (this.quoted) return this.raw;
    if (this.raw === '') return '';
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(this.raw)) {
      const n = Number(this.raw);
      return Number.isNaN(n) ? this.raw : n;
    }
    return this.raw;
  }

  // Go 风格方法别名
  String() {
    return this.toString();
  }

  Int64() {
    return this.int64();
  }

  Float64() {
    return this.float64();
  }

  Bool() {
    return this.bool();
  }
}

/** 将任意值转换为整数（解析失败返回 0）。 */
function toInt(value) {
  if (value instanceof Uncertain) return value.int64();
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const s = String(value).trim();
  return /^[+-]?\d+$/.test(s) ? Number.parseInt(s, 10) : 0;
}

/** 将任意值转换为浮点数（解析失败返回 0）。 */
function toFloat(value) {
  if (value instanceof Uncertain) return value.float64();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

/** 将任意值转换为布尔值（采用 Go strconv.ParseBool 的字符串规则）。 */
function toBool(value) {
  if (value instanceof Uncertain) return value.bool();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (value === null || value === undefined) return false;
  return TRUE_STRINGS.has(String(value).trim());
}

/** 将任意值转换为字符串（null/undefined 返回空串）。 */
function toStr(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Uncertain) return value.toString();
  return String(value);
}

/** 模拟 Go 的 fmt.Sprint（仅供兼容性场景使用）。 */
function goSprint(value) {
  if (value === null || value === undefined) return '<nil>';
  return String(value);
}

/** 把响应中的常见数值字段包装成 Uncertain（按需使用）。 */
function wrapField(value) {
  return Uncertain.from(value);
}

module.exports = {
  Uncertain,
  toInt,
  toFloat,
  toBool,
  toStr,
  goSprint,
  wrapField,
};
