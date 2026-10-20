const assert = require('node:assert/strict');
const { isAutoStart, readStartupEnabled } = require('../shared/startup-settings');
const executablePath = 'C:\\Program Files\\拾用\\拾用.exe';
const entry = { name: 'electrontoolbox', scope: 'user', args: [], enabled: true };
function read(state) {
  return readStartupEnabled({ getLoginItemSettings(options) {
    assert.equal(options.path, `"${executablePath}"`);
    assert.deepEqual(options.args, []);
    return state;
  } }, executablePath);
}
// A custom entry is enabled even though Electron's default entry is absent.
assert.equal(read({ openAtLogin: false, launchItems: [entry] }), true);
assert.equal(read({ launchItems: [{ ...entry, args: ['--autostart'] }] }), true);
assert.equal(isAutoStart(['C:\\拾用.exe', '--autostart']), true);
assert.equal(isAutoStart(['C:\\拾用.exe']), false);
assert.equal(read({ launchItems: [{ ...entry, enabled: false }] }), false);
assert.equal(read({ openAtLogin: true, executableWillLaunchAtLogin: true,
  launchItems: [{ ...entry, name: 'another-app' }] }), false);
assert.equal(read({ launchItems: [{ ...entry, scope: 'machine' }] }), false);
assert.equal(read({ launchItems: [{ ...entry, args: ['--other-mode'] }] }), false);
assert.equal(read({ launchItems: [] }), false);
console.log('开机自启动状态回归检查通过');
