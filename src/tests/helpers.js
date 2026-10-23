"use strict";

/** Test helper: local HTTP server and client construction. */

const http = require("node:http");
const { Client } = require("../index.js");

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Start a local HTTP server.
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
      text: body.toString("utf8"),
    };
    requests.push(record);
    try {
      await handler(req, res, body, record);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err && err.stack ? err.stack : err));
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
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
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(value));
}

/** Construct a test client that skips initialization. */
function makeClient(baseUrl, extra = {}) {
  const client = new Client({
    userId: "12345",
    userToken: "token",
    seed: "seed",
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
    engineVersion: "3.4.5.273121",
    g79LatestVersion: "3.4.18.283127",
    patchResourcesHash: "patchhash",
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
