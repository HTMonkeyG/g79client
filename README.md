# G79Client（JavaScript 重构版）

网易我的世界 G79 客户端库的 JavaScript 重构版。原 Go 版本源码已移动到 [`legacy-go/`](legacy-go/)，可直接对照阅读；新的实现全部位于 [`src/`](src/)，入口为 [`main.js`](main.js)。

- **零运行时依赖**：只使用 Node.js 内置的 `crypto`、`net`、`http`、`https`、`zlib`
- **完整协议支持**：G79 / X19 认证、HTTP 动态签名、PE 认证、聊天服务器、Link 服务器、MPay 游客账号
- **异步 API**：所有网络操作返回 `Promise`
- **双命名风格**：同时提供 `client.getUserDetail()` 与 `client.GetUserDetail()` 两种调用方式
- **可直接作为命令行工具使用**

> 本项目仅用于学习与协议研究。使用时应遵守网易的相关服务条款。

## 环境要求

- Node.js **>= 18.17**（推荐 Node 20 及以上）
- 不需要安装任何第三方依赖

## 目录结构

```
main.js                       入口（库导出 + 命令行）
package.json
examples/                     示例脚本
legacy-go/                    原始 Go 实现（参考用，可忽略）
src/
├── index.js                  汇总导出，挂载 Client 方法
├── client_core.js            Client 类、NewClient、Refetch
├── auth.js                   Cookie / PeAuth / X19 认证、AuthV2
├── crypto.js                 G79 / X19 载荷加密、动态 Token
├── globals.js                补丁信息、release JSON、服务器列表缓存
├── http_util.js              HTTP(S) 请求、gzip 解压、重定向、超时
├── runtime.js                引擎版本等运行期状态
├── engine_consts.js          协议常量
├── types.js                  Uncertain 类型与类型转换工具
├── errors.js                 G79Error / ApiError / NeedVerifyError
├── api/                      各业务接口
│   ├── user.js              用户、好友、动态、设置
│   ├── rental.js            租赁服
│   ├── domain.js            山头服
│   ├── lobby.js             在线大厅
│   ├── store.js             商城 / 组件
│   ├── main_city.js         主城
│   ├── pe_game.js           网络游戏入口
│   ├── transfer.js          传输服务器
│   └── misc.js              昵称定位等
├── services/
│   ├── chat_connection/     聊天 TCP 协议（ChaCha8）
│   └── link_connection/     Link TCP 协议（RSA + ChaCha8）
├── account/mpay/            MPay 设备注册、登录、游客账号
├── utils/                   字节、AES、ChaCha8、ZIP、异步队列等
└── tests/                   单元测试、协议测试与测试样本
```

## 作为库使用

```js
const g79client = require('./main.js');

const client = await g79client.NewClient();       // 拉取补丁 / release / 服务器配置
await client.G79AuthenticateWithCookie(cookie);   // 或 X19AuthenticateWithCookie
console.log(client.userId, client.userDetail.name);
```

`NewClient()` 会：

1. 从 pack list 更新引擎版本（相当于 Go 版本的 `Refetch`）
2. 拉取补丁版本与资源哈希
3. 拉取 G79 / X19 release JSON
4. 默认启动每 60 秒一次的后台配置刷新（定时器已 `unref`，不会阻止进程退出）

如果只需要离线构造客户端（例如测试），可以这样做：

```js
const client = new g79client.Client({
  userId: '123',
  userToken: 'token',
  releaseJSON: { apiGatewayUrl: 'https://example.com' },
  x19ReleaseJSON: { dcWebUrl: 'https://example.com' },
  engineVersion: '3.10.0.300878',
  g79LatestVersion: '3.10.1.301063',
  patchResourcesHash: 'hash',
});

// 或
const offline = await g79client.NewClient({
  skipBootstrap: true,
  patchMeta: { version: '3.10.1.301063', resourcesHash: 'hash' },
  releaseJSON: { apiGatewayUrl: 'https://example.com' },
});
```

### 常见操作

```js
// 用户
await client.GetUserDetail();
await client.UpdateNickname('新名字');
await client.SearchUserByNameOrMail('昵称', 0, 20);
await client.FindPlayerByNickname('昵称');

// 租赁服
const list = await client.GetAvailableRentalServers(
  g79client.SortTypePlayerCount,
  g79client.OrderTypeDesc,
  0,
);
const search = await client.SearchRentalServerByName('48285363');
const enter = await client.EnterRentalServerWorld(search.entities[0].entity_id, '密码');
const authv2 = client.GenerateRentalGameAuthV2(search.entities[0].entity_id, clientKey);
const chain = await client.SendAuthV2Request(authv2);

// 在线大厅
await client.SearchOnlineLobbyRoomByKeyword('86020', 10, 0);
await client.GetOnlineLobbyRoom(roomId);
await client.EnterOnlineLobbyRoom(roomId, '');
await client.OnlineLobbyGameEnter();

// 山头服
await client.JoinDomainServerWithInviteCode('邀请码');
await client.RequestEnterDomainServer(sid);

// 主城
await client.EnterMainCity();
await client.LeaveMainCity();
```

响应是普通 JavaScript 对象（已解析的 JSON），字段名与服务端一致。对于服务端可能返回字符串/数字/布尔的字段，可以使用导出的小工具：

```js
const { Uncertain, toInt, toBool, toStr } = g79client;

toInt('42');       // 42
toBool('1');       // true
Uncertain.from('12').int64(); // 12
```

### 聊天服务器

```js
const svc = await g79client.chatConnection.newChatConnectionService(client);
const endpoint = await svc.selectServer(0);
const conn = await svc.dialWithEndpoint(endpoint, { timeoutMs: 10000 });

await conn.ChatTo(2719712857, 'Hello, world!');

for await (const msg of conn.Messages()) {
  console.log(msg.sequence, msg.command, msg.payload.toString());
}
await conn.Close();
```

### Link 服务器

```js
const svc = await g79client.linkConnection.newLinkConnectionService(client);
const conn = await svc.dial({ timeoutMs: 180000 });

await conn.SendGameStart(null);
await conn.SendChatOnline();
await conn.FetchGlobalMessages(50);
await conn.SendGlobalMessage('大家好');

conn.OnMessage((msg) => {
  console.log(msg.method, msg.json);
});
conn.OnCommonPush((push) => {
  console.log('公共频道', push);
});

await conn.Close();
```

### MPay 游客账号

```js
const mpay = g79client.mpay;

const device = await mpay.generateDevice();
const guest = await device.guest();

console.log(guest.sauth);
const cookie = guest.cookieString();

const client = await g79client.NewClient();
await client.G79AuthenticateWithCookie(cookie);
```

如果 MPay 要求人工验证，会抛出 `mpay.NeedVerifyError`，其中包含 `code`、`reason`、`verifyUrl`。

### PE 签名参数

PE 认证签名默认使用 `(sp, tr) = (2, 9)`，与 Go 版本保持一致。不同客户端版本的官方样本可能使用不同参数（例如仓库中的 3.5.5 样本对应 `(1, 8)`）。如需适配，可在创建客户端时覆盖：

```js
const client = await g79client.NewClient({ peAuthSignParams: [1, 8] });
```

## 命令行

```bash
node main.js help
node main.js refetch
node main.js x19-login --cookie-file cookie.json
node main.js search-room 12345 --cookie '{"sauth_json":"..."}'
node main.js chat 2719712857 "Hello" --cookie-file cookie.json --seconds 30
node main.js link --cookie-file cookie.json --no-interactive --seconds 20
node main.js guest --login
node main.js rental 48285363 密码 --cookie-file cookie.json --client-key <key>
node main.js domain 5A04CC782B5 --cookie-file cookie.json
node main.js main-city --cookie-file cookie.json
node main.js nickname 昵称 --cookie-file cookie.json
node main.js x19-crypto src/tests/fixtures/x19_response.data
```

Cookie 也可以通过环境变量提供：

```bash
export G79_COOKIE_FILE=cookie.json
# 或
export G79_COOKIE='{"sauth_json":"..."}'
```

## TLS 证书说明

部分开发环境（例如带企业代理或本地抓包的环境）的证书链使用弱密钥，Node 默认会拒绝连接，报错形如：

```
EE certificate key too weak
```

此时可以显式关闭证书校验（仅建议在可信的本地调试环境中使用）：

```bash
G79_TLS_INSECURE=1 node main.js refetch
# 或
node main.js refetch --insecure-tls
```

默认情况下证书校验保持开启。

## 主要差异（相对 Go 版本）

| 项目 | Go 版本 | JavaScript 版本 |
|------|---------|-----------------|
| 初始化 | 包 `init()` 立即 `Refetch()` | `NewClient()` 时按需刷新，之后每 60 秒后台刷新 |
| 错误 | `error` 返回值 | 抛出 `Error`（接口错误为 `G79Error` / `ApiError`） |
| 响应 | 强类型结构体 | 普通对象，字段名保持服务端原样 |
| 方法名 | `GetUserDetail` | `getUserDetail`，同时保留 `GetUserDetail` 别名 |
| 字段名 | `UserID` 等 | `userId` 等，同时提供 Go 风格访问器 |
| 二进制结果 | `[]byte` | `Buffer`（AuthV2 链返回 UTF-8 字符串） |
| 并发等待 | `context.Context` | `AbortSignal` + `timeoutMs` |
| 聊天消息 | channel | 异步可迭代队列（`for await`）+ 事件回调 |
| 整数范围 | int64 / uint64 | `Number` 安全整数（超过 2^53 会抛错，实际 UID 远小于该值） |
| 依赖 | chacha8-go、uuid | Node 内置模块（无依赖） |

## 测试

```bash
npm test
```

测试覆盖：

- ChaCha8 与 Go 参考实现的逐字节对比
- G79 / X19 加解密、动态 Token、PeAuth 签名
- 完整 G79 / X19 / PeAuth 认证流程（本地模拟服务器）
- 聊天握手与加密消息收发（本地 TCP 服务器）
- MPay 设备注册、游客、邮箱登录、实名认证（本地模拟服务器）
- ZIP 读取、HTTP gzip 解压、API 请求头与签名

## 许可

AGPL-3.0-only，与原项目一致。详见 [LICENSE](LICENSE)。
