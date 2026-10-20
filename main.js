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
const { STARTUP_NAME, STARTUP_ARG, isAutoStart, readStartupEnabled } = require('./shared/startup-settings');
let registry = [];
let tray;
let trayToolIds = null;
const openHome = () =>
  openWindow('home', path.join(__dirname, 'app/index.html'), '拾用 · 桌面工具箱');
function refreshTrayMenu() {
  if (!tray) return;
  const tools = (trayToolIds || []).map((id) => registry.find((tool) => tool.id === id));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工具箱', click: openHome },
    {
      label: '我的工具',
      submenu: tools.length ? tools.map((tool) => ({
        label: tool.name,
        click: () => openWindow(tool.id, tool.entry, `${tool.name} · 拾用`)
      })) : [{ label: trayToolIds === null ? '正在加载…' : '暂无工具', enabled: false }]
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}
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
function loginItemState() {
  const supported = process.platform === 'win32' && app.isPackaged;
  if (!supported) return { supported, enabled: false };
  return { supported, enabled: readStartupEnabled(app, process.execPath) };
}
function settingsOnly(window) {
  if (window !== windows.get('settings')) throw new Error('仅设置窗口可执行此操作');
}
handle('settings:startup:get', (window) => {
  settingsOnly(window);
  return loginItemState();
});
handle('settings:startup:set', (window, enabled) => {
  settingsOnly(window);
  if (typeof enabled !== 'boolean') throw new Error('自启动参数无效');
  if (!loginItemState().supported) throw new Error('请在 Windows 正式运行包中设置开机自启动');
  app.setLoginItemSettings({ name: STARTUP_NAME, openAtLogin: enabled, enabled, path: process.execPath, args: [STARTUP_ARG] });
  const state = loginItemState();
  if (state.enabled !== enabled) throw new Error('系统未能保存开机自启动设置');
  return state;
});
handle('settings:cache:clear', async (window) => {
  settingsOnly(window);
  await window.webContents.session.clearCache();
  trayToolIds = registry.map((tool) => tool.id);
  refreshTrayMenu();
});
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
  const item = window.toolboxMenu.items[index];
  if (!item.submenu) {
    item.click(item, window);
    return;
  }
  item.submenu.popup({
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
handle('tools:tray:update', (window, ids) => {
  if (window !== windows.get('home')) throw new Error('仅主界面可同步工具列表');
  if (!Array.isArray(ids) || ids.length > registry.length || new Set(ids).size !== ids.length ||
      !ids.every((id) => typeof id === 'string' && registry.some((tool) => tool.id === id)))
    throw new Error('工具列表无效');
  trayToolIds = ids;
  refreshTrayMenu();
});
handle('tools:menu', (window, id, hidden, allowArrange = false) => {
  if (!registry.some((tool) => tool.id === id) || typeof hidden !== 'boolean' || typeof allowArrange !== 'boolean')
    throw new Error('工具菜单参数无效');
  return new Promise((resolve) => {
    let action = null;
    const menu = Menu.buildFromTemplate([
      ...(allowArrange ? [
        { label: '置顶', click: () => { action = 'move-first'; } },
        { label: '排列', click: () => { action = 'arrange'; } }
      ] : []),
      {
        label: hidden ? '取消隐藏' : '隐藏',
        click: () => { action = hidden ? 'show' : 'hide'; }
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
  app.on('second-instance', (_event, argv) => {
    if (app.isReady() && !isAutoStart(argv)) openHome();
  });
  app.whenReady().then(() => {
    registry = discoverTools(path.join(__dirname, 'tools'));
    const icon = nativeImage
      .createFromPath(path.join(__dirname, 'shared/app-icon.png'))
      .resize({ width: 32, height: 32 });
    try {
      tray = new Tray(icon);
      tray.setToolTip('拾用 · 桌面工具箱');
      refreshTrayMenu();
      tray.on('double-click', openHome);
    } catch (error) {
      console.warn('托盘初始化失败', error.message);
    }
    // Create the tray first; fall back to a visible window if it is unavailable.
    if (!isAutoStart(process.argv) || !tray) openHome();
    else openWindow('home', path.join(__dirname, 'app/index.html'), '拾用 · 桌面工具箱', { show: false });
    if (!globalShortcut.register('CommandOrControl+Shift+Space', openHome))
      console.warn('快捷键已被占用：Ctrl+Shift+Space');
    app.on('activate', openHome);
  });
  app.on('window-all-closed', () => {
    if (!tray && process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
