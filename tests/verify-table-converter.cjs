const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message);
  });
  try {
    await window.loadFile(path.join(__dirname, '../tools/table-converter/index.html'));
    const forward = await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('source').value = encodeURIComponent(DEMO_XML);
      await convert();
      const table = document.querySelector('#preview table');
      const clean = wordHtml(officeFragment());
      return {
        xml: DEMO_XML, tables: document.querySelectorAll('#preview table').length,
        rows: table.rows.length,
        merges: Array.from(table.querySelectorAll('[rowspan]'), cell => cell.rowSpan),
        text: table.textContent, tsv: tsvText(), clean,
        enabled: !document.getElementById('copyWord').disabled && !document.getElementById('copyExcel').disabled,
        theme: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim()
      };
    })()`);
    assert.equal(forward.tables, 1);
    assert.equal(forward.rows, 7);
    assert.deepEqual(forward.merges, [3, 3]);
    assert.ok(forward.text.includes('~220V电源'));
    assert.ok(forward.clean.includes('rowspan="3"'));
    assert.ok(!/style=|class=/.test(forward.clean), 'Word 复制内容不应带入界面样式');
    assert.ok(forward.tsv.includes('\tL1\t~220V电源'));
    assert.ok(forward.enabled);
    assert.match(forward.theme, /^#[0-9a-f]{6}$/);
    const packed = deflateRawSync(Buffer.from(encodeURIComponent(forward.xml))).toString('base64');
    const compressed = await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('source').value = ${JSON.stringify('<mxfile><diagram>' + packed + '</diagram></mxfile>')};
      await convert();
      return { rows: document.querySelector('#preview table').rows.length,
        text: document.getElementById('preview').textContent };
    })()`);
    assert.equal(compressed.rows, 7);
    assert.ok(compressed.text.includes('~220V电源'));
    const reverse = await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('modeReverse').click();
      const data = new DataTransfer();
      data.setData('text/html', '<table><tr><th colspan="2">设备清单</th></tr><tr><td rowspan="2">控制器</td><td>主设备</td></tr><tr><td>备用</td></tr></table>');
      document.getElementById('officePaste').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, cancelable: true }));
      document.querySelector('#preview td[rowspan]').textContent = '编辑后的控制器';
      let copied;
      const original = writePlainClipboard;
      writePlainClipboard = (text) => { copied = text; };
      document.getElementById('copyDrawioTop').click();
      writePlainClipboard = original;
      const roundTrip = await extractTables(copied);
      const models = officeModelsFromClipboard('', '中文\\t数量\\n控制器\\t2');
      return {
        tables: roundTrip.length, rows: roundTrip[0].rows.length,
        cells: roundTrip[0].rows.flat().filter(cell => !cell.hidden),
        tsvRows: models[0].rows.map(row => row.map(cell => cell.text)),
        enabled: !document.getElementById('copyDrawio').disabled
      };
    })()`);
    assert.equal(reverse.tables, 1);
    assert.equal(reverse.rows, 3);
    assert.ok(reverse.cells.some(cell => cell.rowspan === 2 && cell.text === '编辑后的控制器'));
    assert.ok(reverse.cells.some(cell => cell.colspan === 2 && cell.text === '设备清单'));
    assert.deepEqual(reverse.tsvRows, [['中文', '数量'], ['控制器', '2']]);
    assert.ok(reverse.enabled);
    const invalid = await window.webContents.executeJavaScript(`(async () => {
      document.getElementById('modeForward').click();
      document.getElementById('source').value = 'invalid XML';
      await convert();
      return document.getElementById('copyWord').disabled && document.getElementById('status').classList.contains('error');
    })()`);
    assert.ok(invalid, '无效输入应显示错误并禁用复制');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('表格工具验证通过：编码 XML、压缩 mxfile、中文和合并单元格、编辑与双向往返、复制内容、主题及无效输入');
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    window.destroy();
    app.exit(1);
  }
});
setTimeout(() => { console.error('表格工具验证超时'); app.exit(1); }, 30000);
