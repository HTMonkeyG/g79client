"use strict";

/** Constants from Go const.go / engine_consts.go. */

const GameVersion = "1.21.2";

const g79AndroidStep = "695616851";
const g79AndroidStep2 = "2146985406";
const g79LibraryHash = "815873bdd82cb7a4ce422da361f7d60d";
const g79SignatureHash = "2b3e7ca013bb30a74d822579860c042b";
const g79BaseMCPHash = "";
const g79AndroidMessageTag = "dashen_cloudgame";

// Default X19 version (auth.go)
const x19DefaultVersion = "1.15.7.20505";

module.exports = {
  GameVersion,
  g79AndroidStep,
  g79AndroidStep2,
  g79LibraryHash,
  g79SignatureHash,
  g79BaseMCPHash,
  g79AndroidMessageTag,
  x19DefaultVersion,
};
