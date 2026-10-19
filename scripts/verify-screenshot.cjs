const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const handlers = new Map();
const created = [];
const shortcuts = new Map();
const pickerCalls = [];
let intervalTick,
  nativeMenuOptions,
  nativeMenuClosed = false;
let menuCursor = { x: 0, y: 0 };
const picker = {
  warm: async () => {},
  stop() {},
  select: async (kind, cursor) => {
    pickerCalls.push({ kind, cursor });
    if (nativeError) throw nativeError;
    return nativeOutput;
  }
};
let confirmation = 0;
const serviceModule = { exports: {} };
let menu,
  copied,
  nativeArgs,
  nativeOutput = 'AA==',
  nativeError,
  hidden = 0,
  restored = 0;
const image = {
  getSize: () => ({ width: 2000, height: 1000 }),
  toDataURL: () => 'data:image/png;base64,AA==',
  isEmpty: () => false,
  resize() {
    return this;
  },
  crop(rect) {
    this.lastCrop = rect;
    return this;
  }
};
class Window extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.webContents = new EventEmitter();
    this.webContents.id = created.length + 10;
    this.webContents.setWindowOpenHandler = () => {};
    this.webContents.send = () => {};
    this.webContents.getZoomFactor = () => 1;
    created.push(this);
  }
  static fromWebContents(sender) {
    return sender.owner;
  }
  setPosition(x, y) {
    Object.assign(this.options, { x, y });
  }
  hide() {
    this.visible = false;
  }
  setAspectRatio(ratio, extra) {
    this.ratio = ratio;
    this.extra = extra;
  }
  getContentBounds() {
    return this.getBounds();
  }
  setContentBounds(bounds) {
    this.setBounds(bounds);
  }
  getBounds() {
    return {
      x: this.options.x || 0,
      y: this.options.y || 0,
      width: this.options.width,
      height: this.options.height
    };
  }
  setBounds(bounds) {
    Object.assign(this.options, bounds);
  }
  setSize(width, height) {
    Object.assign(this.options, { width, height });
  }
  setMenu() {}
  loadFile() {
    return Promise.resolve();
  }
  showInactive() {
    this.visible = true;
  }
  show() {
    this.visible = true;
  }
  focus() {}
  close() {
    this.emit('closed');
  }
  isAlwaysOnTop() {
    return true;
  }
  isDestroyed() {
    return false;
  }
  setOpacity(value) {
    this.opacity = value;
  }
}
const requester = Object.assign(new EventEmitter(), {
  isVisible: () => true,
  hide: () => {
    hidden++;
  },
  isDestroyed: () => false,
  showInactive: () => {
    restored++;
  }
});
const electron = {
  app: { whenReady: () => Promise.resolve(), on() {} },
  globalShortcut: {
    unregister: (key) => shortcuts.delete(key),
    register: (key, callback) => {
      shortcuts.set(key, callback);
      return true;
    }
  },
  clipboard: {
    writeImage: (value) => {
      copied = value;
    }
  },
  nativeImage: { createFromBuffer: () => image },
  BrowserWindow: Window,
  desktopCapturer: {
    getSources: async () => [{ id: 'screen:1', display_id: '1', name: 'screen', thumbnail: image }]
  },
  screen: {
    getAllDisplays: () => [
      {
        id: 1,
        size: { width: 1000, height: 500 },
        scaleFactor: 2,
        bounds: { x: -1000, y: 0, width: 1000, height: 500 }
      }
    ],
    dipToScreenRect: (_window, bounds) => bounds,
    dipToScreenPoint: (point) => point,
    getCursorScreenPoint: () => menuCursor,
    screenToDipPoint: (point) => ({ x: point.x / 2, y: point.y / 2 }),
    getDisplayNearestPoint: () => ({
      id: 1,
      scaleFactor: 2,
      workArea: { x: -1000, y: 0, width: 2000, height: 1000 }
    })
  },
  ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
  Menu: {
    buildFromTemplate: (template) => {
      menu = template;
      return {
        popup(options) {
          nativeMenuOptions = options;
        },
        closePopup() {
          nativeMenuClosed = true;
          nativeMenuOptions.callback();
        }
      };
    }
  },
  dialog: {
    showMessageBoxSync: (_window, options) => {
      assert.equal(options.defaultId, 0);
      return confirmation;
    }
  }
};
vm.runInNewContext(fs.readFileSync(require.resolve('../shared/screenshot-service'), 'utf8'), {
  require: (name) =>
    name === './clipboard'
      ? electron.clipboard
      : name === './desktop-picker'
        ? picker
        : name === 'electron'
          ? electron
          : name === './window-service'
            ? { windows: new Map([['screenshot', requester]]) }
            : name === 'node:child_process'
              ? {
                  execFile: (_file, args, _options, callback) => {
                    nativeArgs = args;
                    callback(nativeError, { stdout: nativeOutput });
                  }
                }
              : require(name),
  module: serviceModule,
  __dirname: require('node:path').resolve(__dirname, '../shared'),
  process: { platform: 'win32' },
  Buffer,
  console,
  setInterval: (callback) => {
    intervalTick = callback;
    return 1;
  },
  clearInterval() {},
  clearTimeout,
  setTimeout
});
(async () => {
  const caller = { sender: { owner: requester } };
  assert.equal(shortcuts.size, 0);
  serviceModule.exports.initialize(requester);
  assert.equal(shortcuts.size, 2);
  await assert.rejects(() => handlers.get('shot:list')({ sender: {} }, 'screen'), /未知窗口/);
  await assert.rejects(() => handlers.get('shot:list')(caller, 'invalid'), /截图类型无效/);
  assert.throws(() => handlers.get('shot:configure')(caller, {}), /截图选项无效/);
  await handlers.get('shot:capture')(caller, 'screen', 'screen:1');
  assert.equal(hidden, 1);
  assert.equal(restored, 0);
  assert.equal(nativeArgs.at(-1), '1');
  const overlay = created[0];
  assert.equal(overlay.options.x, -1000);
  assert.equal(overlay.options.frame, false);
  const event = { sender: overlay.webContents };
  assert.equal(handlers.get('shot:ready')(event).selection, true);
  assert.throws(() => handlers.get('shot:crop')(event, { x: NaN }), /区域无效/);
  handlers.get('shot:crop')(event, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  assert.equal(restored, 1);
  assert.equal(
    JSON.stringify(image.lastCrop),
    JSON.stringify({ x: 200, y: 200, width: 600, height: 400 })
  );
  const picture = created[1];
  function openMenu(window = picture) {
    nativeMenuOptions?.callback?.();
    const count = created.length;
    window.webContents.emit('context-menu');
    assert.equal(created.length, count, '原生菜单不能新建浏览器窗口');
    return menu;
  }
  let items = openMenu();
  assert.deepEqual(Array.from(items, (item) => item.label).filter(Boolean), [
    '窗口置顶',
    '透明度…',
    '边框粗细',
    '重置尺寸（100%）',
    '复制图片',
    '保存图片…',
    '关闭图片',
    '关闭所有图片…'
  ]);
  items.find((item) => item.label === '透明度…').click();
  const panel = created.at(-1);
  const panelEvent = { sender: panel.webContents };
  assert.equal(handlers.get('shot:ready')(panelEvent).opacity, 100);
  handlers.get('shot:opacity')(panelEvent, 37);
  assert.equal(picture.opacity, 0.37);
  assert.throws(() => handlers.get('shot:opacity')(panelEvent, 0), /透明度参数无效/);
  const total = created.length;
  items.find((item) => item.label === '透明度…').click();
  assert.equal(created.length, total);
  handlers.get('shot:cancel')(panelEvent);
  assert.equal(handlers.get('shot:ready')({ sender: picture.webContents }).selection, false);
  items = openMenu();
  items.find((item) => item.label === '透明度…').click();
  const reopened = { sender: created.at(-1).webContents };
  assert.equal(handlers.get('shot:ready')(reopened).opacity, 37);
  handlers.get('shot:cancel')(reopened);
  items = openMenu();
  const borders = items.find((item) => item.label === '边框粗细').submenu;
  assert.deepEqual(
    Array.from(borders, (item) => item.label),
    ['无边框', '较细', '中等', '较粗']
  );
  assert.equal(borders[2].checked, true);
  const before = picture.getContentBounds();
  borders[1].click();
  assert.equal(picture.options.width, before.width - 2);
  assert.equal(picture.options.x, before.x + 1);
  items.find((item) => item.label === '复制图片').click();
  assert.equal(copied, image);
  copied = null;
  picture.webContents.emit(
    'before-input-event',
    { preventDefault() {} },
    { type: 'keyDown', key: 'c', control: true }
  );
  assert.equal(copied, image);
  const copyFunction = electron.clipboard.writeImage;
  const copyErrors = [];
  electron.dialog.showMessageBox = async (_window, options) => {
    copyErrors.push(options.message);
  };
  electron.clipboard.writeImage = async () => {
    throw new Error('clipboard busy');
  };
  await items.find((item) => item.label === '复制图片').click();
  picture.webContents.emit(
    'before-input-event',
    { preventDefault() {} },
    { type: 'keyDown', key: 'c', control: true }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(copyErrors, ['图片复制失败，请重试', '图片复制失败，请重试']);
  electron.clipboard.writeImage = copyFunction;
  picture.setSize(500, 300);
  items.find((item) => item.label === '重置尺寸（100%）').click();
  assert.equal(picture.options.width, 1004);
  assert.equal(picture.options.height, 504);
  assert.equal(picture.ratio, 2);
  assert.equal(picture.extra.width, 4);
  assert.equal(picture.listenerCount('will-resize'), 0);
  assert.throws(() => handlers.get('shot:ready')(event), /未知贴图/);
  await handlers.get('shot:start')(caller, 'screen', { includeCursor: false, hideWindow: false });
  assert.equal(pickerCalls.at(-1).cursor, false);
  assert.equal(hidden, 1);
  assert.equal(pickerCalls.at(-1).kind, 'screen');
  assert.equal(created.at(-1).options.skipTaskbar, false);
  await handlers.get('shot:start')(caller, 'window', { includeCursor: true, hideWindow: true });
  assert.equal(pickerCalls.at(-1).kind, 'window');
  assert.equal(hidden, 2);
  assert.equal(restored, 2);
  const count = created.length;
  nativeOutput = 'CANCEL';
  assert.equal(
    await handlers.get('shot:start')(caller, 'window', { includeCursor: true, hideWindow: true }),
    false
  );
  assert.equal(created.length, count);
  assert.equal(restored, 3);
  nativeError = new Error('capture failed');
  await assert.rejects(
    () => handlers.get('shot:start')(caller, 'screen', { includeCursor: false, hideWindow: true }),
    /capture failed/
  );
  assert.equal(restored, 4);
  nativeError = null;
  nativeOutput = { image: 'AA==', bounds: [-1000, 240, 2000, 1000] };
  await handlers.get('shot:start')(caller, 'screen', { includeCursor: false, hideWindow: false });
  assert.equal(created.length, count + 1);
  assert.equal(created.at(-1).options.x, -503);
  assert.equal(created.at(-1).options.y, 117);
  assert.equal(created.at(-1).options.width, 1006);
  assert.equal(created.at(-1).options.height, 506);
  const original = created.at(-1);
  original.options.x = 900;
  original.options.y = 900;
  original.emit('ready-to-show');
  assert.equal(original.options.x, -503);
  assert.equal(original.options.y, 117);
  const all = openMenu(original).find((item) => item.label === '关闭所有图片…');
  confirmation = 0;
  all.click();
  assert.equal(handlers.get('shot:ready')({ sender: original.webContents }).border, 3);
  confirmation = 1;
  all.click();
  assert.throws(() => handlers.get('shot:ready')({ sender: original.webContents }), /未知贴图/);
  requester.emit('closed');
  assert.equal(shortcuts.size, 0);
  console.log(
    '截图流程检查通过：直接框选、悬停选窗启动、取消和失败恢复、光标选项、快捷键、复制、透明度及边框'
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
