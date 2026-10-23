"use strict";

/**
 * Handle NetEase API fields that may be a string/number/boolean/empty value.
 * Mirrors the Go Uncertain type (types.go).
 */

const TRUE_STRINGS = new Set(["1", "t", "T", "TRUE", "true", "True"]);

class Uncertain {
  constructor(raw = "", quoted = false) {
    this.raw = raw === null || raw === undefined ? "" : String(raw);
    this.quoted = Boolean(quoted);
  }

  static from(value) {
    if (value instanceof Uncertain) return value.clone();
    if (value === null || value === undefined) return new Uncertain("", true);
    if (typeof value === "string") return new Uncertain(value, true);
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
    if (this.raw === "") return 0;
    return /^[+-]?\d+$/.test(this.raw) ? Number.parseInt(this.raw, 10) : 0;
  }

  float64() {
    if (this.raw === "") return 0;
    const value = Number.parseFloat(this.raw);
    return Number.isNaN(value) ? 0 : value;
  }

  bool() {
    if (this.raw === "") return false;
    return TRUE_STRINGS.has(this.raw);
  }

  toJSON() {
    if (this.quoted) return this.raw;
    if (this.raw === "") return "";
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(this.raw)) {
      const n = Number(this.raw);
      return Number.isNaN(n) ? this.raw : n;
    }
    return this.raw;
  }

  // Go-style method aliases
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

/** Convert an arbitrary value to an integer (returns 0 on failure). */
function toInt(value) {
  if (value instanceof Uncertain) return value.int64();
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const s = String(value).trim();
  return /^[+-]?\d+$/.test(s) ? Number.parseInt(s, 10) : 0;
}

/** Convert an arbitrary value to a float (returns 0 on failure). */
function toFloat(value) {
  if (value instanceof Uncertain) return value.float64();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? 0 : n;
}

/** Convert an arbitrary value to a boolean (using Go strconv.ParseBool string rules). */
function toBool(value) {
  if (value instanceof Uncertain) return value.bool();
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (value === null || value === undefined) return false;
  return TRUE_STRINGS.has(String(value).trim());
}

/** Convert an arbitrary value to a string (null/undefined becomes an empty string). */
function toStr(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Uncertain) return value.toString();
  return String(value);
}

/** Mimic Go fmt.Sprint (only for compatibility scenarios). */
function goSprint(value) {
  if (value === null || value === undefined) return "<nil>";
  return String(value);
}

/** Wrap common numeric response fields as Uncertain (use as needed). */
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
