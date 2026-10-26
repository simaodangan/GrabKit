const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
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
    const tagged = await window.webContents.executeJavaScript(`(async () => {
      const source = String.raw\`设累计体积分别为 \\(X(t)\\) 与 \\(Y(t)\\)。

\\[

P(t)=\\frac{K}{V_0}\\left[X(t)-Y(t)\\right],

\\tag{1}

\\]

其中，\\(P(t)\\) 为压力。对式（1）求导。

$$\\begin{aligned}q_{\\mathrm{in}}&=\\dot X\\\\q_{\\mathrm{out}}&=\\dot Y\\end{aligned}\\tag*{流量}$$\`;
      document.getElementById('source').value = source;
      const results = [];
      for (let i = 0; i < 2; i++) {
        await convert();
        const preview = document.getElementById('preview');
        results.push({
          formulas: preview.querySelectorAll('math').length,
          errors: preview.querySelectorAll('.error, merror, parsererror').length,
          labeledRows: preview.querySelectorAll('mlabeledtr').length,
          rows: Array.from(preview.querySelectorAll('mtr')).map(row =>
            Array.from(row.children).map(cell => cell.textContent.trim())),
          text: preview.textContent,
          copyEnabled: !document.getElementById('copy').disabled
        });
      }
      return results;
    })()`);
    for (const converted of tagged) {
      assert.equal(converted.formulas, 5);
      assert.equal(converted.errors, 0, JSON.stringify(converted));
      assert.equal(converted.labeledRows, 0);
      assert.ok(converted.rows.some(row => row.length === 2 && row[1] === '(1)'));
      assert.ok(converted.rows.some(row => row.length === 2 && row[1] === '流量'));
      assert.ok(converted.text.includes('对式（1）求导'));
      assert.ok(converted.copyEnabled);
    }
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(JSON.stringify(result));
    console.log('多行带 tag/tag* 公式及重复转换检查通过');
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
