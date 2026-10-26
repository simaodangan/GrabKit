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
  toPNG: () => Buffer.from('test'),
  toJPEG: (quality) => {
    assert.equal(quality, 95);
    return Buffer.from('jpeg-test');
  },
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
  setAppDetails(details) { this.appDetails = details; }
  constructor(options) {
    super();
    this.options = options;
    this.webContents = new EventEmitter();
    this.webContents.id = created.length + 10;
    this.webContents.setWindowOpenHandler = () => {};
    this.webContents.send = () => {};
    this.webContents.isDestroyed = () => false;
    this.webContents.focus = () => {
      assert.equal(this.focused, true, '先激活贴图窗口，再聚焦页面');
      this.pageFocused = true;
    };
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
  setContentSize(width, height) {
    this.setSize(width, height);
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
  setAlwaysOnTop(value) {
    (this.topmostChanges ||= []).push(value);
  }
  focus() {
    this.focused = true;
    this.topmostAtFocus = this.topmostChanges?.at(-1);
  }
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
vm.runInNewContext(fs.readFileSync(require.resolve('../tools/screenshot/backend/screenshot-service'), 'utf8'), {
  require: (name) =>
    name === '../../../shared/taskbar-group' ? require('../shared/taskbar-group') :
    name === './screenshot-layout' ? require('../tools/screenshot/backend/screenshot-layout') : name === './screenshot-image' ? require('../tools/screenshot/backend/screenshot-image') :
    name === './screenshot-ocr' ? { recognize: async () => [{text:'测试文字',x:0,y:0,width:1,height:1}] } : name === './screenshot-project' ? require('../tools/screenshot/backend/screenshot-project') : name === '../../../shared/clipboard'
      ? electron.clipboard
      : name === './screenshot-mouse'
        ? { watch() {}, warm() {}, stop() {} }
      : name === './desktop-picker'
        ? picker
        : name === 'electron'
          ? electron
          : name === '../../../shared/window-service'
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
  __dirname: require('node:path').resolve(__dirname, '../tools/screenshot/backend'),
  process: { platform: 'win32' },
  Buffer,
  AbortController,
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
  assert.equal(picture.options.alwaysOnTop, false, '截图贴图默认不置顶');
  assert.equal(picture.options.maximizable, false, '双击截图不能最大化');
  assert.equal(handlers.has('shot:drag'), false, '贴图由系统原生处理拖动');
  picture.webContents.emit(
    'before-input-event',
    { preventDefault() {} },
    { type: 'keyDown', key: 'Escape' }
  );
  assert.equal(handlers.get('shot:ready')({ sender: picture.webContents }).selection, false,
    'Esc 不应关闭截图贴图');
  function openMenu(window = picture) {
    nativeMenuOptions?.callback?.();
    const count = created.length;
    window.webContents.emit('context-menu');
    assert.equal(created.length, count, '原生菜单不能新建浏览器窗口');
    return menu;
  }
  let items = openMenu();
  const closeItem = items.find(item => item.label === '关闭图片');
  assert.equal(closeItem.accelerator, 'Delete', 'Delete 使用原生快捷键提示');
  assert.equal(closeItem.registerAccelerator, false, '保留编辑模式下 Delete 删除标注的行为');
  assert.equal(items.find(item => item.label === '保存为图片').accelerator, 'CommandOrControl+S');
  let pngSaves = 0;
  electron.dialog.showSaveDialog = async (_window, options) => {
    pngSaves++;
    assert.match(options.defaultPath, /\.png$/);
    return { canceled:true };
  };
  let savePrevented = false;
  picture.webContents.emit('before-input-event', { preventDefault() { savePrevented = true; } },
    { type:'keyDown', key:'s', control:true });
  assert.equal(savePrevented, true);
  assert.equal(pngSaves, 1, 'Ctrl+S 打开 PNG 保存对话框');
  picture.webContents.emit('before-input-event', { preventDefault() {} },
    { type:'keyDown', key:'s', control:true, isAutoRepeat:true });
  assert.equal(pngSaves, 1, '长按保存快捷键不重复打开对话框');
  assert.deepEqual(Array.from(items, (item) => item.label || item.type), [
    '窗口置顶',
    '编辑图片',
    '提取文字(OCR)',
    'separator',
    '复制图片',
    'separator',
    '透明度…',
    '显示边框',
    '重置尺寸（100%）',
    'separator',
    '保存为图片',
    '保存为可编辑文件',
    'separator',
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
  const borderSwitch = items.find((item) => item.label === '显示边框');
  assert.equal(borderSwitch.type,'checkbox');
  assert.equal(borderSwitch.checked,true);
  assert.equal(borderSwitch.submenu,undefined);
  const before = picture.getContentBounds();
  await borderSwitch.click({checked:false});
  assert.equal(picture.options.width,before.width-6);
  assert.equal(picture.options.x,before.x+3);
  const uncheckedBorder=openMenu().find(item=>item.label==='显示边框');
  assert.equal(uncheckedBorder.checked,false);
  assert.equal(uncheckedBorder.icon,undefined,'未勾选时保留默认空白标记');
  await uncheckedBorder.click({checked:true});
  assert.equal(handlers.get('shot:ready')({sender:picture.webContents}).border,3);
  assert.equal(picture.options.width,before.width);
  assert.equal(picture.options.x,before.x);
  picture.isAlwaysOnTop=()=>false;
  const uncheckedPin=openMenu().find(item=>item.label==='窗口置顶');
  assert.equal(uncheckedPin.checked,false);
  assert.equal(uncheckedPin.icon,undefined,'置顶开关使用默认勾选标记');
  picture.isAlwaysOnTop=()=>true;
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
  assert.equal(picture.options.width, 1006);
  assert.equal(picture.options.height, 506);
  assert.equal(picture.ratio, 2);
  assert.equal(picture.extra.width, 6);
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
  electron.dialog.showSaveDialog = async (_window, options) => {
    assert.match(options.defaultPath, /^截图-\d{8}-\d{6}\.zip\.gkshot$/);
    assert.deepEqual(Array.from(options.filters[0].extensions), ['gkshot'], 'Windows 过滤器只使用最后一段扩展名');
    return { canceled:true };
  };
  await openMenu(original).find(item => item.label === '保存为可编辑文件').click();
  original.options.x = 900;
  original.options.y = 900;
  original.emit('ready-to-show');
  assert.deepEqual(original.topmostChanges, [true, false], '新贴图先提升层级，再恢复普通窗口');
  assert.equal(original.topmostAtFocus, false, '完成置顶状态切换后再获取焦点');
  assert.equal(original.pageFocused, true, '贴图显示后立即聚焦快捷键接收页面');
  copied = null;
  original.webContents.emit('before-input-event', { preventDefault() {} },
    { type: 'keyDown', key: 'c', control: true });
  assert.equal(copied, image, '显示后无需点击即可处理复制快捷键');
  assert.equal(original.options.x, -503);
  assert.equal(original.options.y, 117);
  const ocrMessages = [];
  original.webContents.send = (channel, value) => { if (channel === 'shot:ocr') ocrMessages.push(value); };
  await openMenu(original).find(item => item.label === '提取文字(OCR)').click();
  const textPanel = created.at(-1);
  assert.equal(textPanel.options.show,false,'文字窗口测量完成前保持隐藏');
  assert.throws(()=>handlers.get('shot:ocr-fit')({sender:textPanel.webContents},{width:NaN,height:64}),/尺寸无效/);
  handlers.get('shot:ocr-fit')({sender:textPanel.webContents},{width:240,height:64});
  assert.equal(textPanel.visible,true);
  assert.equal(textPanel.options.height,64,'少量文字不会保留大量空白');
  assert.equal(require('../tools/screenshot/backend/screenshot-layout').overlap(original.getBounds(),textPanel.getBounds()),0,'文字窗口避让截图');
  assert.equal(handlers.get('shot:ocr-ready')({sender:textPanel.webContents})[0].text,'测试文字');
  assert.equal(ocrMessages.at(-1).status,'done');
  assert.ok(openMenu(original).some(item => item.label === '复制选中文字'));
  let copyPrevented = false;
  original.webContents.emit('before-input-event',{preventDefault(){copyPrevented=true;}},{type:'keyDown',key:'c',control:true});
  assert.equal(copyPrevented,false,'OCR 模式保留原生文字复制');
  textPanel.close();
  assert.equal(ocrMessages.at(-1).status,'off','关闭文本窗口同步退出原图 OCR');
  assert.throws(()=>handlers.get('shot:ocr-ready')({sender:textPanel.webContents}),/未知文字窗口/);
  assert.ok(!openMenu(original).some(item => item.label === '复制选中文字'));
  original.webContents.emit('before-input-event',{preventDefault(){copyPrevented=true;}},{type:'keyDown',key:'c',control:true});
  assert.equal(copyPrevented,true,'退出 OCR 后恢复图片复制');
  const fsPromises = require('node:fs/promises');
  const imagePath = require('node:path').resolve(__dirname,'../.npm-cache/open-image-test.png');
  await fsPromises.mkdir(require('node:path').dirname(imagePath),{recursive:true});
  await fsPromises.writeFile(imagePath,Buffer.from('image-fixture'));
  electron.dialog.showOpenDialog = async (_window,options) => {
    assert.ok(options.filters[0].extensions.includes('png'));
    assert.ok(options.filters[0].extensions.includes('gkshot'));
    return {canceled:false,filePaths:[imagePath]};
  };
  assert.equal(await handlers.get('shot:open-project')(caller),true,'普通图片可以进入贴图窗口');
  const imported = created.at(-1);
  assert.equal(handlers.get('shot:ready')({sender:imported.webContents}).project,null);
  assert.equal(handlers.get('shot:ready')({sender:imported.webContents}).dataUrl,image.toDataURL());
  assert.ok(openMenu(imported).some(item=>item.label==='提取文字(OCR)'));
  assert.ok(openMenu(imported).some(item=>item.label==='保存为可编辑文件'));
  assert.equal(imported.appDetails.appId, 'com.electron.electrontoolbox.tool.screenshot');
  assert.equal(imported.options.icon, require('node:path').resolve(__dirname, '../tools/screenshot/icon.png'));
  const exportedPng=imagePath+'.export.png', exportedProject=imagePath+'.zip.gkshot';
  const previousSaveDialog=electron.dialog.showSaveDialog;
  electron.dialog.showSaveDialog=async (_window,options)=>{
    assert.match(options.defaultPath,/^截图-\d{8}-\d{6}\.png$/);
    return {canceled:false,filePath:exportedPng};
  };
  await handlers.get('shot:save')({sender:imported.webContents},'png');
  assert.deepEqual(await fsPromises.readFile(exportedPng),image.toPNG());
  for (const extension of ['jpg', 'jpeg', 'JPG', '']) {
    const selectedPath = require('node:path').join(require('node:path').dirname(imagePath), 'save-format-test' + (extension ? '.' + extension : ''));
    const destination = extension ? selectedPath : selectedPath + '.png';
    electron.dialog.showSaveDialog = async (_window, options) => {
      assert.equal(options.filters.length, 2);
      assert.equal(options.filters[1].extensions.join(','), 'jpg,jpeg');
      return {canceled:false, filePath:selectedPath};
    };
    await handlers.get('shot:save')({sender:imported.webContents}, 'png');
    assert.deepEqual(await fsPromises.readFile(destination), extension ? Buffer.from('jpeg-test') : image.toPNG());
    await fsPromises.unlink(destination);
  }
  electron.dialog.showSaveDialog = async () => ({canceled:true, filePath:exportedPng});
  await handlers.get('shot:save')({sender:imported.webContents}, 'png');
  assert.deepEqual(await fsPromises.readFile(exportedPng), image.toPNG(), '取消保存保留原文件');
  const previousMessageBox = electron.dialog.showMessageBox;
  let saveError;
  electron.dialog.showMessageBox = async (_window, options) => { saveError = options.detail; };
  electron.dialog.showSaveDialog = async () => ({canceled:false, filePath:imagePath + '.unsupported'});
  await handlers.get('shot:save')({sender:imported.webContents}, 'png');
  assert.match(saveError, /请选择 PNG 或 JPEG/);
  await assert.rejects(fsPromises.access(imagePath + '.unsupported'), {code:'ENOENT'});
  electron.dialog.showMessageBox = previousMessageBox;
  imported.webContents.executeJavaScript=async()=>[];
  electron.dialog.showSaveDialog=async (_window,options)=>{
    assert.match(options.defaultPath,/\.zip\.gkshot$/);
    return {canceled:false,filePath:exportedProject};
  };
  await handlers.get('shot:save')({sender:imported.webContents},'project');
  const savedProject=require('../tools/screenshot/backend/screenshot-project').decode(await fsPromises.readFile(exportedProject));
  assert.deepEqual(savedProject.image,image.toPNG());
  assert.deepEqual(savedProject.project.shapes,[]);
  electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[exportedProject]});
  assert.equal(await handlers.get('shot:open-project')(caller),true,'截图源文件仍可打开');
  assert.equal(handlers.get('shot:ready')({sender:created.at(-1).webContents}).project.format,'GrabKit');
  electron.dialog.showSaveDialog=previousSaveDialog;
  const beforeCancel=created.length;
  electron.dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
  assert.equal(await handlers.get('shot:open-project')(caller),false);
  assert.equal(created.length,beforeCancel);
  await fsPromises.unlink(imagePath);
  await fsPromises.unlink(exportedPng);
  await fsPromises.unlink(exportedProject);
  original.webContents.send = () => {};
  handlers.get('shot:editing')({ sender: original.webContents }, true);
  const editorPanel = created.at(-1);
  assert.equal(editorPanel.options.minHeight, 1, '工具栏不应保留固定最小高度');
  assert.equal(editorPanel.options.resizable, false);
  assert.equal(editorPanel.options.thickFrame, false, '工具栏不应保留原生厚边框');
  assert.equal(editorPanel.options.hasShadow, false);
  const editorEvent = { sender: editorPanel.webContents };
  handlers.get('shot:editor-fit')(editorEvent, { width: 540, height: 102 });
  assert.equal(editorPanel.options.width, 540);
  assert.equal(editorPanel.options.height, 102);
  assert.equal(editorPanel.visible, true);
  assert.throws(() => handlers.get('shot:editor-fit')(editorEvent, { width: -1, height: 100 }), /工具栏尺寸无效/);
  // Windows may destroy the parent renderer before closing the child toolbar.
  original.webContents.isDestroyed = () => true;
  original.webContents.send = () => { throw new Error('Object has been destroyed'); };
  assert.doesNotThrow(() => editorPanel.emit('closed'));
  original.webContents.isDestroyed = () => false;
  original.webContents.send = () => {};
  handlers.get('shot:editing')({ sender: original.webContents }, true);
  const closingPanel = created.at(-1);
  original.emit('close');
  original.webContents.send = () => { throw new Error('Object has been destroyed'); };
  assert.doesNotThrow(() => closingPanel.emit('closed'));
  handlers.get('shot:editing')({ sender: original.webContents }, false);
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
