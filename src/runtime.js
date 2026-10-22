'use strict';

/** 运行期可变状态（对应 Go 包级变量）。 */

const DEFAULT_ENGINE_VERSION = '3.4.5.273121';

const state = {
  engineVersion: DEFAULT_ENGINE_VERSION,
  osName: 'android',
  gameVersion: '1.21.2',
  x19DefaultVersion: '1.15.7.20505',
};

function getEngineVersion() {
  return state.engineVersion;
}

function setEngineVersion(version) {
  if (typeof version === 'string' && version.trim() !== '') {
    state.engineVersion = version;
  }
  return state.engineVersion;
}

function getOSName() {
  return state.osName;
}

function setOSName(name) {
  state.osName = String(name);
  return state.osName;
}

function getGameVersion() {
  return state.gameVersion;
}

function getX19DefaultVersion() {
  return state.x19DefaultVersion;
}

module.exports = {
  state,
  DEFAULT_ENGINE_VERSION,
  getEngineVersion,
  setEngineVersion,
  getOSName,
  setOSName,
  getGameVersion,
  getX19DefaultVersion,
};
