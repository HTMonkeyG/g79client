'use strict';

/** 测试辅助：本地 HTTP 服务器与客户端构造。 */

const http = require('node:http');
const { Client } = require('../index');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 启动本地 HTTP 服务器。
 * @param {(req, res, body, meta) => any} handler
 */
async function startServer(handler) {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const record = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
      text: body.toString('utf8'),
    };
    requests.push(record);
    try {
      await handler(req, res, body, record);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err && err.stack ? err.stack : err));
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    requests,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close(resolve);
    }),
  };
}

function writeJSON(res, value, status = 200, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(value));
}

/** 构造一个跳过初始化的测试客户端。 */
function makeClient(baseUrl, extra = {}) {
  const client = new Client({
    userId: '12345',
    userToken: 'token',
    seed: 'seed',
    releaseJSON: {
      coreServerUrl: baseUrl,
      webServerUrl: baseUrl,
      apiGatewayUrl: baseUrl,
      authServerUrl: baseUrl,
      transferServerNewHttpUrl: baseUrl,
    },
    x19ReleaseJSON: {
      coreServerUrl: baseUrl,
      dcWebUrl: baseUrl,
      apiGatewayGrayUrl: `${baseUrl}/x19`,
    },
    engineVersion: '3.4.5.273121',
    g79LatestVersion: '3.4.18.283127',
    patchResourcesHash: 'patchhash',
    ...extra,
  });
  return client;
}

module.exports = {
  readBody,
  startServer,
  writeJSON,
  makeClient,
};
