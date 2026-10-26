const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const output = path.join(__dirname, '../out/formula-word-verification');
const source = String.raw`# 公式编号验证

设驱动端累计输入体积和喷嘴累计输出体积分别为 \(X(t)\) 与 \(Y(t)\)，对应流量为 \(q_{\mathrm{in}}(t)=\dot X(t)\) 和 \(q_{\mathrm{out}}(t)=\dot Y(t)\)。

\[

P(t)=\frac{K}{V_0}\left[X(t)-Y(t)\right],

\tag{1}

\]

其中，\(P(t)\) 为相对于喷嘴出口的压力，\(K\) 为材料体积模量，\(V_0\) 为料筒内材料的参考体积。对式（1）求导，可得体积守恒关系。

$$\begin{aligned}q_{\mathrm{in}}&=\dot X\\q_{\mathrm{out}}&=\dot Y\end{aligned}\tag{2.3}$$

$$a+b=c\tag*{固定编号}$$

**正文格式**与未编号公式：\(a^2+b^2=c^2\)。
`;

app.whenReady().then(async () => {
  let code = 0;
  const window = new BrowserWindow({ show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadFile(path.join(__dirname, '../tools/formula-converter/index.html'));
    const errors = [];
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message);
    });
    const html = await window.webContents.executeJavaScript(`(async () => {
      await MathJax.startup.promise;
      document.getElementById('source').value = ${JSON.stringify(source)};
      await convert();
      let payload;
      // Capture the payload at the copy event boundary without relying on the
      // test runner's access to an interactive Windows clipboard.
      const execCommand = document.execCommand;
      document.execCommand = (command) => {
        if (command !== 'copy') throw new Error('Unexpected copy command');
        const event = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), cancelable: true });
        document.dispatchEvent(event);
        payload = event.clipboardData.getData('text/html');
        return event.defaultPrevented;
      };
      await copyPreview();
      document.execCommand = execCommand;
      return payload;
    })()`, true);
    assert.ok(html, '复制按钮没有生成 HTML');
    assert.equal((html.match(/msEquation 12/g) || []).length, 3);
    assert.equal((html.match(/<m:maxDist/g) || []).length, 3);
    assert.ok(html.includes('http://schemas.microsoft.com/office/2004/12/omml'));
    assert.ok(!html.includes('data-equation-label'));
    assert.ok(html.includes('<strong>正文格式</strong>'));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    // Ctrl+C follows the same copy handler, without another command or mode.
    const keyboardPayload = await window.webContents.executeJavaScript(`(() => {
      const event = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), cancelable: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('preview'));
      selection.addRange(range);
      document.dispatchEvent(event);
      selection.removeAllRanges();
      return event.clipboardData.getData('text/html');
    })()`);
    assert.equal((keyboardPayload.match(/msEquation 12/g) || []).length, 3);
    const plainCopy = await window.webContents.executeJavaScript(`(() => {
      const event = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), cancelable: true });
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#preview h1'));
      selection.addRange(range);
      document.dispatchEvent(event);
      selection.removeAllRanges();
      return event.defaultPrevented;
    })()`);
    assert.equal(plainCopy, false, '普通文本复制不应被公式处理拦截');
    console.log('复制事件检查通过：原有复制按钮和 Ctrl+C 均携带原生固定编号');
    if (process.argv.includes('--word')) {
      fs.mkdirSync(output, { recursive: true });
      const runOutput = fs.mkdtempSync(path.join(output, 'run-'));
      fs.writeFileSync(path.join(runOutput, 'payload.html'), html);
      const result = await run('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'verify-formula-word.ps1'), '-OutputDirectory', runOutput],
      { timeout: 60000, encoding: 'utf8' });
      console.log(result.stdout.trim());
    }
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    window.destroy();
    app.exit(code);
  }
});
setTimeout(() => { console.error('Word 公式验证超时'); app.exit(1); }, 90000);
