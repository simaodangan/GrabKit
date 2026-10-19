const { BrowserWindow, dialog, Menu } = require('electron');
const path = require('node:path');
const windows = new Map();
function openWindow(id, entry, title) {
  const existing = windows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const settings = id === 'settings' || id === 'about';
  const window = new BrowserWindow({
    icon: path.join(__dirname, 'app-icon.ico'),
    width: settings ? 600 : 1180,
    height: settings ? 300 : 800,
    minWidth: settings ? 480 : 800,
    minHeight: settings ? 260 : 600,
    frame: settings,
    maximizable: !settings,
    title,
    backgroundColor: '#f7f8fc',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  windows.set(id, window);
  if (id === 'screenshot') require('./screenshot-service').initialize(window);
  const menu = Menu.buildFromTemplate([
    {
      label: '窗口(&W)',
      submenu: [
        {
          id: 'pin-window',
          label: '窗口置顶',
          type: 'checkbox',
          checked: window.isAlwaysOnTop(),
          accelerator: 'CommandOrControl+Shift+T',
          click: (item) => window.setAlwaysOnTop(item.checked)
        },
        {
          label: '设置',
          click: () =>
            openWindow('settings', path.join(__dirname, '../app/settings.html'), '设置 · 拾用')
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '刷新页面', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: '关于',
          click: () => openWindow('about', path.join(__dirname, '../app/about.html'), '关于拾用')
        }
      ]
    }
  ]);
  window.setMenu(null);
  window.toolboxMenu = menu;
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const modifier = input.control || input.meta;
    if (modifier && input.shift && input.key.toLowerCase() === 't') {
      event.preventDefault();
      window.setAlwaysOnTop(!window.isAlwaysOnTop());
    } else if (modifier && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    } else if (modifier && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      window.webContents.reload();
    }
  });
  window.on('always-on-top-changed', (_event, value) => {
    menu.getMenuItemById('pin-window').checked = value;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: ['继续编辑', '放弃更改并关闭'],
      defaultId: 0,
      cancelId: 0,
      message: '有尚未保存的内容，是否关闭？'
    });
    if (choice === 1) event.preventDefault();
  });
  window.on('closed', () => windows.delete(id));
  window.loadFile(entry).catch((error) => console.error('页面加载失败', error.message));
  return window;
}
module.exports = { openWindow, windows };
