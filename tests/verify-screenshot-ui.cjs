const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const requests = [];
app.disableHardwareAcceleration();
ipcMain.handle('window:chrome', () => ({
  assets: pathToFileURL(path.resolve(__dirname, '../shared') + path.sep).href
}));
ipcMain.handle('shot:prepare', () => {});
ipcMain.handle('shot:configure', () => {});
ipcMain.handle('shot:open-project', () => { requests.push({ kind:'project' }); });
ipcMain.handle('shot:start', (_event, kind, options) => {
  requests.push({ kind, options });
});
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      offscreen: true,
      preload: path.resolve(__dirname, '../preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  try {
    await window.loadFile(path.resolve(__dirname, '../tools/screenshot/index.html'));
    const layout = await window.webContents.executeJavaScript(`(() => {
      const buttons = [...document.querySelectorAll('.capture-actions button')];
      return { buttons: buttons.map(button => { const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), cursor: document.querySelector('#cursor').checked, hide: document.querySelector('#hide').checked };
    })()`);
    assert.equal(layout.buttons.length, 2);
    assert.ok(layout.buttons[0].height <= 56);
    assert.ok(layout.cursor && layout.hide);
    await window.webContents.executeJavaScript(`document.querySelector('#region').click()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].kind, 'screen');
    await window.webContents.executeJavaScript(`document.querySelector('#open-project').click()`);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(requests[1].kind, 'project');
    const preview = await window.webContents.capturePage();
    await fs.mkdir(path.resolve(__dirname, '../.npm-cache'), { recursive: true });
    await fs.writeFile(
      path.resolve(__dirname, '../.npm-cache/screenshot-ui-preview.png'),
      preview.toPNG()
    );
    console.log('界面检查通过：统一截图入口、高度不超过 56 像素、默认勾选、单击直接发起截图');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('界面验证超时');
  app.exit(1);
}, 20000);
