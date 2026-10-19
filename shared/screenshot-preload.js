const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shot', {
  ready: () => ipcRenderer.invoke('shot:ready'),
  crop: (rect) => ipcRenderer.invoke('shot:crop', rect),
  cancel: () => ipcRenderer.invoke('shot:cancel'),
  opacity: (value) => ipcRenderer.invoke('shot:opacity', value),
  fitOpacity: (height) => ipcRenderer.invoke('shot:opacity-fit', height),
  onBorder: (callback) => ipcRenderer.on('shot:border', (_event, value) => callback(value)),
  onViewport: (callback) => ipcRenderer.on('shot:viewport', (_event, value) => callback(value))
});
