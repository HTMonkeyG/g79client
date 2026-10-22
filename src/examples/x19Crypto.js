'use strict';

/** X19 加解密示例（对应 Go legacy-go/example/x19_crypto）。 */

const fs = require('node:fs');
const path = require('node:path');

const g79client = require('../index');

async function run(args = [], options = {}) {
  const files = args.length > 0
    ? args
    : [
      path.join(__dirname, '../tests/fixtures/x19_request.data'),
      path.join(__dirname, '../tests/fixtures/x19_response.data'),
    ];

  for (const file of files) {
    const cipherData = fs.readFileSync(file);
    const plain = g79client.X19HttpDecrypt(cipherData);
    const json = g79client.GetValidJSON(plain);
    console.log(`==== ${path.basename(file)} ====`);
    console.log(json.toString('utf8'));
    console.log();
  }
}

module.exports = { run };
