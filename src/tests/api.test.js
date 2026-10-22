'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const { CalculateDynamicToken } = require('../crypto');
const { G79Error } = require('../errors');
const { startServer, writeJSON, makeClient } = require('./helpers');

test('getUserDetail 使用正确的路径、请求头与签名', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, entity: { name: 'Tester', level: '5' } });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  const resp = await client.getUserDetail();
  assert.equal(resp.entity.name, 'Tester');

  const req = server.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/pe-user-detail/get');
  assert.equal(req.text, '{}');
  assert.equal(req.headers['content-length'], '2');
  assert.equal(req.headers['transfer-encoding'], undefined);
  assert.equal(req.headers['user-id'], '12345');
  assert.equal(req.headers['user-agent'], 'WPFLauncher/0.0.0.0');
  assert.equal(req.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(
    req.headers['user-token'],
    CalculateDynamicToken('/pe-user-detail/get', '{}', 'token'),
  );
});

test('getOtherDomainServers 发送原始空对象并声明 gzip', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, entities: [{ sid: 'abc' }] });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  const resp = await client.getOtherDomainServers();
  assert.equal(resp.entities[0].sid, 'abc');

  const req = server.requests[0];
  assert.equal(req.url, '/domain-server/get-other-servers');
  assert.equal(req.text, '{}');
  assert.match(req.headers['accept-encoding'], /gzip/);
  assert.equal(req.headers['user-agent'], 'libhttpclient/1.0.0.0');
});

test('getAvailableRentalServers 请求体字段正确', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, entities: [], total: 0 });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.getAvailableRentalServers(1, 0, 20);

  const req = server.requests[0];
  assert.equal(req.url, '/rental-server/query/available-by-sort-type');
  assert.deepEqual(JSON.parse(req.text), { sort_type: 1, order_type: 0, offset: 20 });
});

test('searchOnlineLobbyRoomByKeyword 使用当前 GameVersion', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, entities: [], total: 0 });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.searchOnlineLobbyRoomByKeyword('abc', 10, 5);

  const payload = JSON.parse(server.requests[0].text);
  assert.equal(payload.version, '1.21.2');
  assert.equal(payload.keyword, 'abc');
  assert.equal(payload.length, 10);
  assert.equal(payload.offset, 5);
});

test('getTransferRoomWithName 不发送 user-token', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, list: [] });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.getTransferRoomWithName('房间');

  const req = server.requests[0];
  assert.equal(req.url, '/room-with-name');
  assert.equal(req.headers['user-token'], undefined);
  assert.equal(req.headers['user-id'], '12345');
  assert.equal(req.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(req.text), { name: '房间', uid: 12345 });
});

test('updateNickname 更新本地用户信息，并在失败时抛错', async (t) => {
  let responseCode = 0;
  const server = await startServer((req, res) => {
    writeJSON(res, responseCode === 0
      ? { code: 0 }
      : { code: 1, message: '名称不可用' });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  client.userDetail = { name: 'old' };

  await client.updateNickname('new');
  assert.equal(client.userDetail.name, 'new');

  responseCode = 1;
  await assert.rejects(() => client.updateNickname('bad'), /更新昵称失败: 名称不可用/);
});

test('sendMoment 补齐 Go 结构体的零值字段', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0 });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  const opts = { category: 'game', extra: '{}' };
  await client.sendMoment('正文', opts);

  assert.deepEqual(JSON.parse(server.requests[0].text), {
    comment_auth: 0,
    category: 'game',
    extra: '{}',
    image: '',
    video: '',
    at_role_id: '',
    forward_uid: '',
    forward_msg_id: '',
    source_uid: '',
    source_msg_id: '',
  });
  await assert.rejects(() => client.sendMoment('   ', opts), /content 不能为空/);

  // opts 为 nil 时与 Go 的 nil 指针一致，发送 JSON null
  await client.sendMoment('正文');
  assert.equal(server.requests[1].text, 'null');
});

test('purchaseItem 与 getDownloadInfo 路径正确', async (t) => {
  const server = await startServer((req, res) => {
    writeJSON(res, { code: 0, entity: { entity_id: 'e' } });
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await client.purchaseItem('item-1');
  await client.getDownloadInfo('item-1');

  assert.equal(server.requests[0].url, '/pe-purchase-item/');
  assert.deepEqual(JSON.parse(server.requests[0].text), {
    item_id: 'item-1',
    expertcomment_info: { expertcomment_id: '0', video_url: '0', expert_id: '0' },
    buy_path: '商城:item-1',
    coupon_ids: [],
    cdk_code: '',
  });
  assert.equal(server.requests[1].url, '/pe-download-item/get-download-info');
});

test('响应不是 JSON 时抛出带标签的错误', async (t) => {
  const server = await startServer((req, res) => {
    res.writeHead(200);
    res.end('not json');
  });
  t.after(server.close);

  const client = makeClient(server.url);
  await assert.rejects(
    () => client.getUserDetail(),
    (err) => err instanceof G79Error && /解析用户详情响应失败/.test(err.message),
  );
});

test('HTTP 层自动解压 gzip 响应', async (t) => {
  const server = await startServer((req, res) => {
    const body = zlib.gzipSync(JSON.stringify({ code: 0, entity: { room_name: '压缩房间' } }));
    res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' });
    res.end(body);
  });
  t.after(server.close);

  const client = makeClient(server.url);
  const resp = await client.getOnlineLobbyRoom('1');
  assert.equal(resp.entity.room_name, '压缩房间');
});

test('getUserIdInt 解析与错误处理', () => {
  const client = makeClient('http://127.0.0.1:1');
  assert.equal(client.getUserIdInt(), 12345);
  client.userId = 'abc';
  assert.throws(() => client.getUserIdInt(), /invalid syntax/);
  client.userId = '123456789012345678901234567890';
  assert.throws(() => client.getUserIdInt(), /安全整数范围/);
});

test('Go 风格别名可用', () => {
  const client = makeClient('http://127.0.0.1:1');
  assert.equal(typeof client.GetUserDetail, 'function');
  assert.equal(typeof client.G79AuthenticateWithCookie, 'function');
  assert.equal(typeof client.GetUserIDInt, 'function');
  assert.equal(typeof client.SearchOnlineLobbyRoomByKeyword, 'function');
  client.UserID = '42';
  assert.equal(client.userId, '42');
  client.UserDetail = { name: 'x' };
  assert.equal(client.userDetail.name, 'x');
});
