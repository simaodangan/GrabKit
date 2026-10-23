const { BrowserWindow, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { setTaskbarGroup } = require('./taskbar-group');
const windows = new Map();
function openWindow(id, entry, title, { show = true } = {}) {
  const existing = windows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (show) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
    }
    return existing;
  }
  const settings = id === 'settings' || id === 'about';
  const toolIcon = path.join(path.dirname(entry), 'icon.png');
  const iconPath = id !== 'home' && !settings && fs.existsSync(toolIcon)
    ? toolIcon : path.join(__dirname, 'app-icon.ico');
  const compactSize = {
    home: { width: 980, height: 680, minWidth: 800, minHeight: 560 },
    screenshot: { width: 600, height: 520, minWidth: 520, minHeight: 460 }
  }[id];
  const window = new BrowserWindow({
    show: false,
    icon: iconPath,
    width: settings ? 600 : 1180,
    height: id === 'settings' ? 640 : settings ? 300 : 800,
    minWidth: settings ? 480 : 800,
    minHeight: settings ? 260 : 600,
    ...compactSize,
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
  window.toolboxIcon = iconPath === toolIcon ? require('node:url').pathToFileURL(iconPath).href : null;
  setTaskbarGroup(window, id === 'home' || settings ? 'main' : id);
  windows.set(id, window);
  if (id === 'screenshot') require('../tools/screenshot/backend/screenshot-service').initialize(window);
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
        }
      ]
    },
    {
      label: '设置',
      click: () =>
        openWindow('settings', path.join(__dirname, '../app/settings.html'), '设置 · 随手用')
    },
    {
      label: '帮助',
      submenu: [
        { label: '刷新页面', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: '关于',
          click: () => openWindow('about', path.join(__dirname, '../app/about.html'), '关于随手用')
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
  if (id === 'screenshot') window.on('close', (event) => {
    if (require('../tools/screenshot/backend/screenshot-resident').keepOnClose(window)) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => windows.delete(id));
  window.loadFile(entry).catch((error) => console.error('页面加载失败', error.message));
  if (show) window.show();
  return window;
}
module.exports = { openWindow, windows };
