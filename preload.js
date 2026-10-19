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
    const bar = document.createElement('div');
    bar.className = 'bar';
    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.src = chrome.assets + 'app-icon.png';
    icon.alt = '拾用';
    bar.append(icon);
    for (const [index, label] of ['窗口', '帮助'].entries()) {
      const button = document.createElement('button');
      button.className = 'menu';
      button.textContent = label;
      button.setAttribute('aria-haspopup', 'menu');
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
  listTools: () => ipcRenderer.invoke('tools:list'),
  showToolMenu: (id, selected) => ipcRenderer.invoke('tools:menu', id, selected),
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
    prepare: () => ipcRenderer.invoke('shot:prepare'),
    list: (kind) => ipcRenderer.invoke('shot:list', kind),
    capture: (kind, id) => ipcRenderer.invoke('shot:capture', kind, id),
    start: (kind, options) => ipcRenderer.invoke('shot:start', kind, options),
    configure: (options) => ipcRenderer.invoke('shot:configure', options)
  }
});
