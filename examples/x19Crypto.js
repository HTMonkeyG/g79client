"use strict";

/** X19 encryption/decryption example (mirrors Go legacy-go/example/x19_crypto). */

const fs = require("node:fs");
const path = require("node:path");

const g79client = require("../src/index.js");

async function run(args = [], options = {}) {
  const files = args.length > 0
    ? args
    : [
      path.join(__dirname, "../src/tests/fixtures/x19_request.data"),
      path.join(__dirname, "../src/tests/fixtures/x19_response.data"),
    ];

  for (const file of files) {
    const cipherData = fs.readFileSync(file);
    const plain = g79client.X19HttpDecrypt(cipherData);
    const json = g79client.GetValidJSON(plain);
    console.log(`==== ${path.basename(file)} ====`);
    console.log(json.toString("utf8"));
    console.log();
  }
}

module.exports = { run };
