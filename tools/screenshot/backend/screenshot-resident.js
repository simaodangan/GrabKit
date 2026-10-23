const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
let state;
let quitting = false;
let available = false;
let changed = () => {};
function file() { return path.join(app.getPath('userData'), 'screenshot-resident.json'); }
function read() {
  if (!state) {
    try {
      const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
      state = { enabled: saved.enabled === true, prompted: saved.prompted === true };
    } catch { state = { enabled: false, prompted: false }; }
  }
  return state;
}
function save(next) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const temporary = file() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(next));
  fs.renameSync(temporary, file());
  state = next;
}
function get() { return { enabled: read().enabled, supported: available }; }
function set(enabled) {
  if (typeof enabled !== 'boolean') throw new Error('后台常驻参数无效');
  if (enabled && !available) throw new Error('托盘不可用，无法开启后台常驻');
  save({ enabled, prompted: true });
  changed(get());
  return get();
}
function configure(supported, onChange) { available = supported; changed = onChange; }
function keepOnClose(window) {
  if (quitting || !available) return false;
  if (!read().prompted && !read().enabled) {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: '快速截图',
      message: '是否让截图工具常驻后台？',
      detail: '关闭截图窗口后保留截图服务，下次截图更快，也可直接使用截图快捷键。会占用少量内存，可在设置或托盘菜单中关闭。',
      buttons: ['开启常驻', '暂不开启'], defaultId: 1, cancelId: 1
    });
    try { set(choice === 0); }
    catch (error) { console.warn('保存截图常驻设置失败', error.message); }
  }
  return read().enabled;
}
app.on('before-quit', () => { quitting = true; });
module.exports = { get, set, configure, keepOnClose };
