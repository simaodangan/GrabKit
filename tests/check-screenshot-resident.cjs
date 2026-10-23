const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-resident-'));
let choice = 1;
let prompts = 0;
function load() {
  const app = new EventEmitter();
  app.getPath = () => directory;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../tools/screenshot/backend/screenshot-resident.js'), 'utf8'), {
    require: (name) => name === 'electron' ? {
      app, dialog: { showMessageBoxSync: () => { prompts++; return choice; } }
    } : require(name), module, console
  });
  return { service: module.exports, app };
}
try {
  let { service, app } = load();
  assert.equal(service.get().enabled, false);
  assert.equal(service.keepOnClose({}), false);
  assert.equal(prompts, 0); // No tray means no hidden window or prompt.
  assert.throws(() => service.set(true));
  let changes = 0;
  service.configure(true, () => changes++);
  assert.equal(service.keepOnClose({}), false);
  assert.equal(service.keepOnClose({}), false);
  assert.equal(prompts, 1);
  service.set(true);
  assert.equal(service.keepOnClose({}), true);
  assert.equal(changes, 2);
  ({ service, app } = load());
  service.configure(true, () => {});
  assert.equal(service.get().enabled, true); // Survives application restart.
  assert.equal(service.keepOnClose({}), true);
  app.emit('before-quit');
  assert.equal(service.keepOnClose({}), false); // Exit never hides the window.
  service.set(false);
  assert.equal(load().service.get().enabled, false);
  assert.throws(() => service.set('true'));
  fs.writeFileSync(path.join(directory, 'screenshot-resident.json'), '{broken');
  assert.equal(load().service.get().enabled, false);
  console.log('截图常驻设置检查通过：默认关闭、持久化、首次提示、托盘不可用和完整退出');
} finally {
  for (const name of ['screenshot-resident.json', 'screenshot-resident.json.tmp']) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmdirSync(directory);
}
