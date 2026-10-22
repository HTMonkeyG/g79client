'use strict';

/** 游客账号生成示例（对应 Go legacy-go/example/guest）。 */

const g79client = require('../index');
const { readLine, pretty } = require('./common');

async function run(args = [], options = {}) {
  const mpay = g79client.mpay;
  const requestOptions = { timeoutMs: options.timeoutMs ?? options.timeout ?? 15000 };

  const device = await mpay.generateDevice(requestOptions);
  console.log('设备 ID:', device.id);

  let guest;
  for (;;) {
    try {
      guest = await device.guest(requestOptions);
      break;
    } catch (err) {
      if (!(err instanceof mpay.NeedVerifyError)) throw err;
      console.log(`生成游客账号需要验证: ${err.reason} (code=${err.code})`);
      if (err.verifyUrl) console.log(`请打开链接完成验证: ${err.verifyUrl}`);
      await readLine('验证完成后按回车继续...');
    }
  }

  console.log('生成的游客 Sauth:');
  console.log(pretty(guest.sauth));

  const cookie = guest.cookieString();
  console.log('Cookie:', cookie);

  if (options.login) {
    const client = await g79client.NewClient({ requestTimeoutMs: options.timeoutMs ?? options.timeout });
    for (;;) {
      try {
        await client.G79AuthenticateWithCookie(cookie);
        break;
      } catch (err) {
        if (!(err instanceof mpay.NeedVerifyError)) throw err;
        console.log(`游客登录需要验证: ${err.reason} (code=${err.code})`);
        if (err.verifyUrl) console.log(`请打开链接完成验证: ${err.verifyUrl}`);
        await readLine('验证完成后按回车继续...');
      }
    }
    console.log(`登录成功，UserID=${client.userId}，最新昵称=${client.userDetail?.name ?? ''}`);
    return client;
  }

  return { device, guest, cookie };
}

module.exports = { run };
