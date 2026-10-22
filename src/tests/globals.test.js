'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const globals = require('../globals');
const runtime = require('../runtime');

test('补丁版本选择与引擎版本前缀匹配', (t) => {
  const previous = runtime.getEngineVersion();
  t.after(() => runtime.setEngineVersion(previous));

  runtime.setEngineVersion('3.10.0.300878');
  assert.equal(
    globals.selectAndroidPatchVersion(['3.9.42.301055', '3.10.0.300900', '3.10.1.301063']),
    '3.10.1.301063',
  );
  assert.throws(
    () => globals.selectAndroidPatchVersion(['1.0.0.1']),
    /no android patch version matches base prefix 3\.10/,
  );
  assert.throws(
    () => globals.selectAndroidPatchVersion([]),
    /no android patch versions available/,
  );
});

test('Release JSON 规范化保留服务端字段', () => {
  const g79 = globals.normalizeG79ReleaseJSON({
    CoreServerUrl: 'core',
    AuthServerUrl: 'auth',
    WebServerUrl: 'web',
    ApiGatewayUrl: 'api',
    TransferServerUrl: 'transfer',
    TransferServerNewHttpUrl: 'transfer2',
    ChatServerUrl: 'chat',
    LinkServerUrl: 'link',
  });
  assert.equal(g79.coreServerUrl, 'core');
  assert.equal(g79.apiGatewayUrl, 'api');
  assert.equal(g79.chatServerUrl, 'chat');

  const x19 = globals.normalizeX19ReleaseJSON({
    CoreServerUrl: 'core',
    DCWebUrl: 'dc',
    ApiGatewayGrayUrl: 'gray',
  });
  assert.equal(x19.coreServerUrl, 'core');
  assert.equal(x19.dcWebUrl, 'dc');
  assert.equal(x19.apiGatewayGrayUrl, 'gray');
});

test('服务器条目规范化', () => {
  const chat = globals.normalizeChatServer({
    IP: '1.2.3.4',
    Isp_Enabled: 1,
    ctcc_host: 'ct',
    cmcc_host: 'cm',
    cucc_host: 'cu',
    Port: 15000,
  });
  assert.deepEqual(
    { ip: chat.ip, ispEnabled: chat.ispEnabled, ctccHost: chat.ctccHost, port: chat.port },
    { ip: '1.2.3.4', ispEnabled: 1, ctccHost: 'ct', port: 15000 },
  );

  const link = globals.normalizeLinkServer({
    status: 0,
    ip: '5.6.7.8',
    ServerType: 'dockerA',
    id: 8701,
    port: 10200,
  });
  assert.equal(link.ip, '5.6.7.8');
  assert.equal(link.serverType, 'dockerA');
  assert.equal(link.port, 10200);

  const transfer = globals.normalizeTransferServer({
    ip: '9.9.9.9',
    ports: [1, 2],
    WebPort: 8080,
  });
  assert.equal(transfer.ip, '9.9.9.9');
  assert.deepEqual(transfer.ports, [1, 2]);
  assert.equal(transfer.webPort, 8080);

  const pack = globals.normalizePackListEntry({
    url: 'u',
    version: '3.10.0.300878',
    min_ver: '3.9.0.1',
  });
  assert.equal(pack.version, '3.10.0.300878');
  assert.equal(pack.minVer, '3.9.0.1');
});
