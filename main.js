const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  desktopCapturer
} = require('electron');
const path = require('node:path');
const { discoverTools } = require('./shared/tool-registry');
const { openWindow, windows } = require('./shared/window-service');
const clipboard = require('./shared/clipboard');
const files = require('./shared/file-service');
let registry = [];
let tray;
const openHome = () =>
  openWindow('home', path.join(__dirname, 'app/index.html'), '拾用 · 桌面工具箱');
function senderWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || ![...windows.values()].includes(window)) throw new Error('未知窗口');
  return window;
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => callback(senderWindow(event), ...args));
}
handle('app:version', () => app.getVersion());
handle('app:about', () => require('./shared/app-info').getAppInfo());
handle('app:settings', () => {
  openWindow('settings', path.join(__dirname, 'app/settings.html'), '设置 · 拾用');
});
handle('window:chrome', (window) => ({
  nativeFrame: window === windows.get('settings') || window === windows.get('about'),
  assets: require('node:url').pathToFileURL(path.join(__dirname, 'shared') + path.sep).href
}));
handle('window:menu', (window, index, x) => {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= window.toolboxMenu.items.length ||
    !Number.isFinite(x)
  )
    throw new Error('菜单参数无效');
  window.toolboxMenu.items[index].submenu.popup({
    window,
    x: Math.max(0, Math.min(Math.round(x), window.getContentSize()[0])),
    y: 42
  });
});
handle('window:action', (window, action) => {
  switch (action) {
    case 'minimize':
      window.minimize();
      break;
    case 'maximize':
      window.isMaximized() ? window.unmaximize() : window.maximize();
      break;
    case 'close':
      window.close();
      break;
    default:
      throw new Error('未知窗口操作');
  }
});
handle('tools:list', () => registry.map(({ entry, ...metadata }) => metadata));
handle('tools:menu', (window, id, selected) => {
  if (!registry.some((tool) => tool.id === id) || typeof selected !== 'boolean')
    throw new Error('工具菜单参数无效');
  return new Promise((resolve) => {
    let action = null;
    const menu = Menu.buildFromTemplate([
      {
        label: selected ? '取消收藏' : '收藏',
        click: () => {
          action = 'toggle-favorite';
        }
      }
    ]);
    menu.popup({ window, callback: () => resolve(action) });
  });
});
handle('tools:open', (_window, id) => {
  const tool = registry.find((item) => item.id === id);
  if (!tool) throw new Error('工具不存在');
  openWindow(tool.id, tool.entry, `${tool.name} · 拾用`);
});
handle('clipboard:read', () => clipboard.readText());
handle('clipboard:write', (_window, text) => clipboard.writeText(text));
handle('files:open', (window) => files.openText(window));
handle('files:save', (window, text) => files.saveText(window, text));
handle('window:pin', (window, value) => {
  if (typeof value !== 'boolean') throw new Error('置顶参数无效');
  window.setAlwaysOnTop(value);
  return window.isAlwaysOnTop();
});
handle('screen:capture', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 3840, height: 2160 }
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    dataUrl: source.thumbnail.toDataURL()
  }));
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (app.isReady()) openHome();
  });
  app.whenReady().then(() => {
    registry = discoverTools(path.join(__dirname, 'tools'));
    openHome();
    const icon = nativeImage
      .createFromPath(path.join(__dirname, 'shared/app-icon.png'))
      .resize({ width: 32, height: 32 });
    try {
      tray = new Tray(icon);
      tray.setToolTip('拾用 · 桌面工具箱');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: '打开工具箱', click: openHome },
          {
            label: '所有工具',
            submenu: registry.map((tool) => ({
              label: tool.name,
              click: () => openWindow(tool.id, tool.entry, `${tool.name} · 拾用`)
            }))
          },
          { type: 'separator' },
          { label: '退出', click: () => app.quit() }
        ])
      );
      tray.on('double-click', openHome);
    } catch (error) {
      console.warn('托盘初始化失败', error.message);
    }
    if (!globalShortcut.register('CommandOrControl+Shift+Space', openHome))
      console.warn('快捷键已被占用：Ctrl+Shift+Space');
    app.on('activate', openHome);
  });
  app.on('window-all-closed', () => {
    if (!tray && process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
