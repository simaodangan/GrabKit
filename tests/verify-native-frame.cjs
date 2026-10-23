const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const picker = require('../tools/screenshot/backend/desktop-picker');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    await picker.warm();
    const window = new BrowserWindow({
      x: 130,
      y: 150,
      width: 406,
      height: 306,
      show: false,
      frame: false,
      thickFrame: false,
      useContentSize: true,
      webPreferences: { sandbox: true }
    });
    await window.loadURL('data:text/html,<body>frame test</body>');
    const handle = window.getNativeWindowHandle().readBigUInt64LE().toString();
    const scale = await window.webContents.executeJavaScript('devicePixelRatio');
    let border = Math.round(3 * scale);
    const original = await picker.measure(handle);
    const content = [
      original[0] - border * 2,
      original[1] - border * 2,
      original[2] + border,
      original[3] + border
    ];
    for (const value of [0, 2, 4, 3, 2, 0, 3]) {
      const next = Math.round(value * scale);
      const actual = await picker.changeBorder(handle, next - border);
      assert.deepEqual(
        [actual[0] - next * 2, actual[1] - next * 2, actual[2] + next, actual[3] + next],
        content
      );
      border = next;
    }
    console.log(
      `真实 Windows 客户区检查通过：${scale * 100}% 缩放，连续切换边框后图片位置和尺寸逐像素不变`
    );
    picker.stop();
    app.exit(0);
  } catch (error) {
    console.error(error);
    picker.stop();
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('原生边框验证超时');
  picker.stop();
  app.exit(1);
}, 20000);
