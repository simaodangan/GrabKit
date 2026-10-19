const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function getAppInfo() {
  let buildDate = '尚未编译为 EXE';
  if (app.isPackaged) {
    try {
      const metadata = JSON.parse(
        fs.readFileSync(path.join(app.getAppPath(), 'build-info.json'), 'utf8')
      );
      if (/^\d{4}-\d{2}-\d{2}$/.test(metadata.buildDate)) buildDate = metadata.buildDate;
      else buildDate = '编译日期未记录';
    } catch {
      buildDate = '编译日期未记录';
    }
  }
  return {
    name: '拾用 · 桌面工具箱',
    editor: 'AI',
    version: app.getVersion().replace(/\.0$/, ''),
    buildDate
  };
}

module.exports = { getAppInfo };
