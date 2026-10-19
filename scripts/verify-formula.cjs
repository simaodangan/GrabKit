const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message);
  });
  try {
    await window.loadFile(path.join(__dirname, '../tools/formula-converter/index.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      await MathJax.startup.promise;
      document.getElementById('example').click();
      await new Promise(resolve => setTimeout(resolve, 500));
      return { formulas: document.querySelectorAll('#preview math').length, copyEnabled: !document.getElementById('copy').disabled, status: document.getElementById('status').textContent };
    })()`);
    if (result.formulas < 1 || !result.copyEnabled || errors.length)
      throw new Error(JSON.stringify({ result, errors }));
    console.log(JSON.stringify(result));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('验证超时');
  app.exit(1);
}, 20000);
