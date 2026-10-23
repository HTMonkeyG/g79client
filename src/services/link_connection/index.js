"use strict";

const connection = require("./connection.js");
const service = require("./service.js");

module.exports = {
  ...connection,
  ...service,
};
