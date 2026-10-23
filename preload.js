const { contextBridge, ipcRenderer } = require('electron');
// 由应用外壳统一注入标题栏，各 HTML 工具无需重复实现。
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const chrome = await ipcRenderer.invoke('window:chrome');
    if (chrome.nativeFrame) return;
    const layout = document.createElement('link');
    layout.rel = 'stylesheet';
    layout.href = chrome.assets + 'titlebar-layout.css';
    document.head.append(layout);
    const host = document.createElement('toolbox-titlebar');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.assets + 'titlebar.css';
    shadow.append(style);
    const iconStyle = document.createElement('link');
    iconStyle.rel = 'stylesheet';
    iconStyle.href = chrome.assets + 'brand-icon.css';
    shadow.append(iconStyle);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const icon = document.createElement(chrome.iconUrl ? 'img' : 'span');
    icon.className = chrome.iconUrl ? 'app-icon' : 'app-icon themed-app-icon';
    if (chrome.iconUrl) { icon.src = chrome.iconUrl; icon.alt = document.title; }
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', chrome.iconUrl ? document.title : '随手用');
    bar.append(icon);
    for (const [index, label] of ['窗口', '设置', '帮助'].entries()) {
      const button = document.createElement('button');
      button.className = 'menu';
      button.textContent = label;
      if (label !== '设置') button.setAttribute('aria-haspopup', 'menu');
      button.onclick = () => {
        const x = Math.round(button.getBoundingClientRect().left);
        ipcRenderer.invoke('window:menu', index, x).catch(console.error);
      };
      bar.append(button);
    }
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.append(spacer);
    for (const [action, text, label] of [
      ['minimize', '−', '最小化'],
      ['maximize', '□', '最大化或还原'],
      ['close', '×', '关闭窗口']
    ]) {
      const button = document.createElement('button');
      button.className = action;
      button.textContent = text;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.onclick = () => ipcRenderer.invoke('window:action', action).catch(console.error);
      bar.append(button);
    }
    shadow.append(bar);
    document.body.prepend(host);
  } catch (error) {
    console.error('标题栏初始化失败', error);
  }
});
contextBridge.exposeInMainWorld('desktop', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  getAppInfo: () => ipcRenderer.invoke('app:about'),
  settings: {
    getScreenshotResident: () => ipcRenderer.invoke('settings:screenshot-resident:get'),
    setScreenshotResident: (enabled) => ipcRenderer.invoke('settings:screenshot-resident:set', enabled),
    onScreenshotResidentChanged: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('settings:screenshot-resident:changed', listener);
      return () => ipcRenderer.removeListener('settings:screenshot-resident:changed', listener);
    },
    getStartup: () => ipcRenderer.invoke('settings:startup:get'),
    setStartup: (enabled) => ipcRenderer.invoke('settings:startup:set', enabled),
    clearCache: () => ipcRenderer.invoke('settings:cache:clear')
  },
  listTools: () => ipcRenderer.invoke('tools:list'),
  syncTrayTools: (ids) => ipcRenderer.invoke('tools:tray:update', ids),
  showToolMenu: (id, hidden, allowArrange = false) => ipcRenderer.invoke('tools:menu', id, hidden, allowArrange),
  openTool: (id) => ipcRenderer.invoke('tools:open', id),
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:read'),
    writeText: (text) => ipcRenderer.invoke('clipboard:write', text)
  },
  files: {
    openText: () => ipcRenderer.invoke('files:open'),
    saveText: (text) => ipcRenderer.invoke('files:save', text)
  },
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:pin', value),
  captureScreens: () => ipcRenderer.invoke('screen:capture'),
  screenshots: {
    openProject: () => ipcRenderer.invoke('shot:open-project'),
    prepare: () => ipcRenderer.invoke('shot:prepare'),
    list: (kind) => ipcRenderer.invoke('shot:list', kind),
    capture: (kind, id) => ipcRenderer.invoke('shot:capture', kind, id),
    start: (kind, options) => ipcRenderer.invoke('shot:start', kind, options),
    configure: (options) => ipcRenderer.invoke('shot:configure', options)
  }
});
