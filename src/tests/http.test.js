'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { HttpClient, httpRequest } = require('../http_util');
const { startServer } = require('./helpers');

test('HTTP 客户端跟随重定向并将 POST 302 转为 GET', async (t) => {
  const server = await startServer((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { Location: '/final' });
      res.end();
      return;
    }
    if (req.url === '/final') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        method: req.method,
        body: req.method === 'GET' ? '' : 'x',
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(server.close);

  const res = await httpRequest(`${server.url}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"a":1}',
  });
  const data = JSON.parse(res.body.toString('utf8'));
  assert.equal(data.method, 'GET');
  assert.equal(data.body, '');
  assert.equal(server.requests.length, 2);
});

test('HTTP 请求超时会拒绝 Promise', async (t) => {
  const server = await startServer(() => {
    // 故意不响应
  });
  t.after(server.close);

  const client = new HttpClient({ timeoutMs: 80 });
  await assert.rejects(
    () => client.get(`${server.url}/slow`),
    /request timeout after 80ms/,
  );
});

test('HTTP POST 自动设置 Content-Length', async (t) => {
  const server = await startServer((req, res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      length: Number(req.headers['content-length']),
      actual: body.length,
      transferEncoding: req.headers['transfer-encoding'] ?? null,
    }));
  });
  t.after(server.close);

  const client = new HttpClient();
  const res = await client.post(`${server.url}/echo`, Buffer.from('你好世界'));
  const data = JSON.parse(res.body.toString('utf8'));
  assert.equal(data.length, Buffer.byteLength('你好世界'));
  assert.equal(data.actual, Buffer.byteLength('你好世界'));
  assert.equal(data.transferEncoding, null);
});
