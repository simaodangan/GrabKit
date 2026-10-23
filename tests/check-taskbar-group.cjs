const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../shared/taskbar-group'), 'utf8');
for (const platform of ['win32', 'linux', 'darwin']) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { platform } });
  const apply = module.exports.setTaskbarGroup;
  const ids = [];
  const window = { setAppDetails: ({ appId }) => ids.push(appId) };
  apply(window);
  apply(window, 'screenshot');
  apply(window, 'screenshot');
  apply(window, 'formula-converter');
  if (platform === 'win32') {
    assert.equal(new Set(ids).size, 3, '主程序与不同工具分别分组');
    assert.equal(ids[1], ids[2], '同一工具的窗口归入同组');
    assert.equal(ids[0], 'com.electron.electrontoolbox');
  } else assert.equal(ids.length, 0, '其他系统不调用 Windows 专用接口');
}
console.log('任务栏分组检查通过：主程序、不同工具、同工具窗口与跨平台兼容');
