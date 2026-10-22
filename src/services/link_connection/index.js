'use strict';

const connection = require('./connection');
const service = require('./service');

module.exports = {
  ...connection,
  ...service,
};
