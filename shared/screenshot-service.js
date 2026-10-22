const {
  app,
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  Menu,
  dialog,
  globalShortcut,
  nativeImage
} = require('electron');
const clipboard = require('./clipboard');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const path = require('node:path');
const fs = require('node:fs/promises');
const projectFile = require('./screenshot-project');
const { windows } = require('./window-service');
const sessions = new Map();
const opacityPanels = new Map();
const editorPanels = new Map();
const desktopPicker = require('./desktop-picker');
const nativeMouse = require('./screenshot-mouse');
let capturing = false;
let preferences = { includeCursor: true, hideWindow: true, magnification: 4 };
function options(value) {
  if (!value || typeof value.includeCursor !== 'boolean' || typeof value.hideWindow !== 'boolean')
    throw new Error('截图选项无效');
  const magnification = value.magnification ?? 4;
  if (!Number.isInteger(magnification) || magnification < 2 || magnification > 8) throw new Error('放大倍数无效');
  return { includeCursor: value.includeCursor, hideWindow: value.hideWindow, magnification };
}
async function captureImage(kind, item, display, settings) {
  if (process.platform !== 'win32') {
    if (settings.includeCursor) throw new Error('包含光标目前仅支持 Windows');
    return item.thumbnail;
  }
  const bounds = display
    ? screen.dipToScreenRect(null, display.bounds)
    : { x: 0, y: 0, width: 1, height: 1 };
  const handle = kind === 'window' ? item.id.split(':')[1] : '0';
  if (!/^\d+$/.test(handle)) throw new Error('窗口标识无效');
  const result = await execute(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'capture-windows.ps1'),
      kind,
      handle,
      String(bounds.x),
      String(bounds.y),
      String(bounds.width),
      String(bounds.height),
      settings.includeCursor ? '1' : '0'
    ],
    { windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 20000 }
  );
  const image = nativeImage.createFromBuffer(Buffer.from(result.stdout.trim(), 'base64'));
  if (image.isEmpty()) throw new Error('截图失败');
  return image;
}
function owner(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || ![...windows.values()].includes(window)) throw new Error('未知窗口');
  return window;
}
async function sources(kind) {
  if (!['screen', 'window'].includes(kind)) throw new Error('截图类型无效');
  const displays = screen.getAllDisplays();
  const width = Math.max(...displays.map((d) => Math.ceil(d.size.width * d.scaleFactor)));
  const height = Math.max(...displays.map((d) => Math.ceil(d.size.height * d.scaleFactor)));
  return desktopCapturer.getSources({ types: [kind], thumbnailSize: { width, height } });
}
function originalSize(image, point, border) {
  const scale = screen.getDisplayNearestPoint(point).scaleFactor || 1;
  const size = image.getSize();
  return {
    width: Math.max(1, Math.round(size.width / scale)) + border * 2,
    height: Math.max(1, Math.round(size.height / scale)) + border * 2
  };
}
function screenshotFilename(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `截图-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}
function create(image, bounds, selection = false, project = null) {
  const border = selection ? 0 : 3;
  const point = bounds || screen.getCursorScreenPoint();
  const initialBounds = selection
    ? bounds
    : {
        ...(bounds ? { x: bounds.x - border, y: bounds.y - border } : {}),
        ...originalSize(image, point, border)
      };
  const window = new BrowserWindow({
    icon: path.join(__dirname, 'app-icon.ico'),
    ...initialBounds,
    minWidth: 1,
    minHeight: 1,
    frame: false,
    transparent: false,
    backgroundColor: '#7764d8',
    useContentSize: true,
    hasShadow: false,
    resizable: !selection,
    maximizable: false,
    movable: !selection,
    alwaysOnTop: selection,
    show: false,
    thickFrame: false,
    roundedCorners: false,
    skipTaskbar: selection,
    title: selection ? '框选截图' : '截图贴图',
    webPreferences: {
      preload: path.join(__dirname, 'screenshot-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  const state = {
    window,
    image,
    project,
    hasEdited: !!project?.shapes.length,
    selection,
    border,
    opacity: 1,
    filename: screenshotFilename(new Date())
  };
  window.on('will-move', () => {
    if (state.editing) window.webContents.send('shot:remind');
  });
  let viewportTimer;
  const nativeHandle = () => window.getNativeWindowHandle().readBigUInt64LE().toString();
  const refreshViewport = () => {
    if (selection || window.isDestroyed() || typeof window.getNativeWindowHandle !== 'function')
      return;
    desktopPicker
      .measure(nativeHandle())
      .then((pixels) => {
        if (!window.isDestroyed()) {
          state.viewport = pixels;
          window.webContents.send('shot:viewport', pixels);
        }
      })
      .catch((error) => {
        if (!window.isDestroyed()) console.warn('贴图客户区测量失败', error.message);
      });
  };
  window.on('resize', () => {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(refreshViewport, 80);
  });
  window.once('closed', () => clearTimeout(viewportTimer));
  if (!selection)
    window.setAspectRatio(image.getSize().width / image.getSize().height, {
      width: border * 2,
      height: border * 2
    });
  const sessionId = window.webContents.id;
  sessions.set(sessionId, state);
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('close', () => {
    state.closing = true;
    state.openMenu?.closePopup(window);
  });
  window.on('closed', () => sessions.delete(sessionId));
  window.webContents.on('context-menu', () => {
    if (!selection) popup(state);
  });
  window.on('system-context-menu', (event) => {
    event.preventDefault();
    if (!selection) popup(state);
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (
      !selection &&
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      ['c', 's'].includes(input.key.toLowerCase())
    ) {
      event.preventDefault();
      if (input.key.toLowerCase() === 's') {
        if (!input.isAutoRepeat) void saveImage(state);
      } else void copyImage(state);
    }
  });
  window.once('ready-to-show', () => {
    // Raise independently of the minimized toolbox, then restore normal pinning.
    window.setAlwaysOnTop(true);
    window.show();
    // Reapply after showing: Windows may otherwise relocate a newly created window.
    if (bounds && !selection) window.setContentBounds(initialBounds);
    window.focus();
    if (!selection) window.setAlwaysOnTop(false);
    refreshViewport();
    if (!selection && process.platform === 'win32' && typeof window.getNativeWindowHandle === 'function') {
      nativeMouse.watch(window, action => {
        if (window.isDestroyed()) return;
        if (action === 'menu') popup(state);
        else if (action === 'double' && !state.editing) window.webContents.send('shot:remind');
      });
    }
  });
  window
    .loadFile(path.join(__dirname, '../tools/screenshot/picture.html'))
    .catch(() => window.close());
  return window;
}
function setBorder(state, value) {
  if (![0, 2, 3, 4].includes(value)) throw new Error('边框参数无效');
  if (process.platform === 'win32' && typeof state.window.getNativeWindowHandle === 'function') {
    const change = async () => {
      if (state.window.isDestroyed()) return value;
      const scale = screen.getDisplayNearestPoint(state.window.getContentBounds()).scaleFactor || 1;
      const delta = Math.round(value * scale) - Math.round(state.border * scale);
      const handle = state.window.getNativeWindowHandle().readBigUInt64LE().toString();
      const pixels = await desktopPicker.changeBorder(handle, delta);
      if (!state.window.isDestroyed()) {
        state.border = value;
        state.viewport = pixels;
        state.window.setAspectRatio(state.image.getSize().width / state.image.getSize().height, {
          width: value * 2,
          height: value * 2
        });
        state.window.webContents.send('shot:viewport', pixels);
        state.window.webContents.send('shot:border', value);
      }
      return value;
    };
    const operation = (state.borderQueue || Promise.resolve()).then(change);
    state.borderQueue = operation.catch(() => {});
    return operation;
  }
  const delta = value - state.border;
  const bounds = state.window.getContentBounds();
  state.window.setContentBounds({
    x: bounds.x - delta,
    y: bounds.y - delta,
    width: Math.max(value * 2 + 1, bounds.width + delta * 2),
    height: Math.max(value * 2 + 1, bounds.height + delta * 2)
  });
  state.border = value;
  state.window.setAspectRatio(state.image.getSize().width / state.image.getSize().height, {
    width: value * 2,
    height: value * 2
  });
  state.window.webContents.send('shot:border', value);
  return value;
}
function openOpacity(state) {
  if (state.opacityPanel && !state.opacityPanel.isDestroyed()) {
    state.opacityPanel.show();
    state.opacityPanel.focus();
    return;
  }
  const point = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  const panel = new BrowserWindow({
    x: Math.max(area.x, Math.min(point.x, area.x + area.width - 264)),
    y: Math.max(area.y, Math.min(point.y, area.y + area.height - 1)),
    width: 264,
    height: 1,
    minHeight: 1,
    useContentSize: true,
    frame: false,
    resizable: false,
    parent: state.window,
    alwaysOnTop: state.window.isAlwaysOnTop(),
    skipTaskbar: true,
    show: false,
    backgroundColor: '#f7f8fc',
    webPreferences: {
      preload: path.join(__dirname, 'screenshot-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  state.opacityPanel = panel;
  const id = panel.webContents.id;
  opacityPanels.set(id, { state, panel });
  panel.setMenu(null);
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', (event) => event.preventDefault());
  const close = () => {
    if (!panel.isDestroyed()) panel.close();
  };
  panel.on('blur', close);
  state.window.once('closed', close);
  panel.once('closed', () => {
    opacityPanels.delete(id);
    state.opacityPanel = null;
    state.window.removeListener('closed', close);
  });
  // Show only after the page reports its natural content height.
  panel.loadFile(path.join(__dirname, '../tools/screenshot/opacity.html')).catch(close);
}
async function copyImage(state) {
  try {
    await clipboard.writeImage(state.hasEdited ? await renderedImage(state) : state.image);
  } catch (error) {
    if (!state.window.isDestroyed()) {
      dialog
        .showMessageBox(state.window, {
          type: 'error',
          message: '图片复制失败，请重试',
          detail: error.message
        })
        .catch(() => {});
    }
  }
}
function popup(state) {
  const { window } = state;
  if (state.openMenu || window.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: window.isAlwaysOnTop(),
      click: (item) => {
        window.setAlwaysOnTop(item.checked);
        for (const panel of [state.editorPanel, state.opacityPanel])
          if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(item.checked);
      }
    },
    { label: state.editing ? '退出编辑' : '编辑图片', click: () => setEditing(state, !state.editing) },
    { type: 'separator' },
    { label: '复制图片', accelerator: 'CommandOrControl+C', click: () => copyImage(state) },
    { type: 'separator' },
    { label: '透明度…', click: () => openOpacity(state) },
    {
      label: '边框粗细',
      submenu: [
        ['无边框', 0],
        ['较细', 2],
        ['中等', 3],
        ['较粗', 4]
      ].map(([label, value]) => ({
        label,
        type: 'radio',
        checked: state.border === value,
        click: () => {
          Promise.resolve(setBorder(state, value)).catch((error) => {
            if (!window.isDestroyed())
              dialog.showMessageBox(window, {
                type: 'error',
                message: '边框调整失败',
                detail: error.message
              });
          });
        }
      }))
    },
    {
      label: '重置尺寸（100%）',
      click: () => {
        const bounds = window.getContentBounds();
        const size = originalSize(
          state.image,
          { x: bounds.x + state.border, y: bounds.y + state.border },
          state.border
        );
        window.setSize(size.width, size.height);
      }
    },
    { type: 'separator' },
    { label: '保存 PNG 图片…', accelerator: 'CommandOrControl+S', click: () => saveImage(state) },
    { label: '保存源文件…', click: () => saveProject(state) },
    { type: 'separator' },
    { label: '关闭图片\tDelete', click: () => window.close() },
    {
      label: '关闭所有图片…',
      click: () => {
        const result = dialog.showMessageBoxSync(window, {
          type: 'question',
          title: '关闭所有图片',
          message: '确定关闭所有截图图片吗？',
          detail: '未保存的截图将无法恢复。',
          buttons: ['取消', '关闭所有图片'],
          defaultId: 0,
          cancelId: 0
        });
        if (result === 1)
          for (const item of [...sessions.values()])
            if (!item.selection && !item.window.isDestroyed()) item.window.close();
      }
    }
  ]);
  state.openMenu = menu;
  menu.popup({
    window,
    callback: () => {
      if (state.openMenu === menu) state.openMenu = null;
    }
  });
}
async function saveImage(state) {
  try {
    const result = await dialog.showSaveDialog(state.window, {
      defaultPath: state.filename,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    });
    if (!result.canceled && result.filePath)
      await fs.writeFile(result.filePath, (await renderedImage(state)).toPNG());
  } catch (error) {
    if (!state.window.isDestroyed())
      dialog.showMessageBox(state.window, {
        type: 'error',
        message: '图片保存失败',
        detail: error.message
      });
  }
}
async function saveProject(state) {
  try {
    const result = await dialog.showSaveDialog(state.window, {
      title: '保存 GrabKit 截图源文件',
      defaultPath: state.filename.replace(/\.png$/i, '') + '.zip.gkshot',
      // Windows filters match the final suffix; compound extensions get appended twice.
      filters: [{ name: 'GrabKit 截图工程 (*.zip.gkshot)', extensions: ['gkshot'] }]
    });
    if (result.canceled || !result.filePath) return;
    const shapes = await state.window.webContents.executeJavaScript('window.screenshotEditor.exportProject()');
    const destination = /\.zip\.gkshot$/i.test(result.filePath) ? result.filePath : result.filePath + '.zip.gkshot';
    await fs.writeFile(destination, projectFile.encode(state.image.toPNG(), shapes));
  } catch (error) {
    if (!state.window.isDestroyed()) await dialog.showMessageBox(state.window, { type:'error', message:'源文件保存失败', detail:error.message });
  }
}
ipcMain.handle('shot:save', (event, format) => {
  const state = editorPanels.get(event.sender.id) || sessions.get(event.sender.id);
  if (!state || state.selection || !['png','project'].includes(format)) throw new Error('保存参数无效');
  return format === 'png' ? saveImage(state) : saveProject(state);
});
ipcMain.handle('shot:open-project', async event => {
  const requester = owner(event);
  const result = await dialog.showOpenDialog(requester, { title:'打开 GrabKit 截图源文件', properties:['openFile'], filters:[{name:'GrabKit 截图工程 (*.zip.gkshot)',extensions:['gkshot']}] });
  if (result.canceled || !result.filePaths.length) return false;
  const filename = result.filePaths[0];
  if ((await fs.stat(filename)).size > projectFile.MAX) throw new Error('源文件过大');
  const { project, image:buffer } = projectFile.decode(await fs.readFile(filename));
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('源文件中的原图无效');
  create(image, undefined, false, project);
  return true;
});
ipcMain.handle('shot:project-loaded', event => {
  const state = sessions.get(event.sender.id);
  if (!state?.project) throw new Error('未知源文件');
  setEditing(state, true);
});
function setEditing(state, editing) {
  // A child can close after the parent's WebContents dies but before its window does.
  if (state.closing || state.window.isDestroyed() || state.window.webContents.isDestroyed()) return;
  state.editing = editing;
  if (editing) state.hasEdited = true;
  state.window.webContents.send('shot:editing', editing);
  if (editing) openEditorPanel(state);
  else if (state.editorPanel && !state.editorPanel.isDestroyed()) state.editorPanel.hide();
}
function openEditorPanel(state) {
  if (state.editorPanel && !state.editorPanel.isDestroyed()) {
    state.editorPanel.show();
    return;
  }
  const bounds = state.window.getBounds();
  const area = screen.getDisplayNearestPoint(bounds).workArea;
  const width = Math.min(620, area.width), height = 1;
  const below = bounds.y + bounds.height + 8;
  const y = below + height <= area.y + area.height ? below : bounds.y - height - 8;
  const panel = new BrowserWindow({
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)),
    width, height, minWidth: 1, minHeight: 1, frame: false, useContentSize: true, resizable: false,
    thickFrame: false, hasShadow: false, roundedCorners: false,
    parent: state.window, alwaysOnTop: state.window.isAlwaysOnTop(), skipTaskbar: true, show: false,
    backgroundColor: '#f7f8fc',
    webPreferences: { preload: path.join(__dirname, 'screenshot-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  state.editorPanel = panel;
  state.editorPanelFitted = false;
  const panelId = panel.webContents.id;
  editorPanels.set(panelId, state);
  panel.setMenu(null);
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', event => event.preventDefault());
  panel.once('closed', () => {
    editorPanels.delete(panelId);
    state.editorPanel = null;
    if (state.editing && !state.window.isDestroyed()) setEditing(state, false);
  });
  state.window.once('closed', () => { if(!panel.isDestroyed())panel.close(); });
  panel.loadFile(path.join(__dirname, '../tools/screenshot/editor-toolbar.html')).catch(() => panel.close());
}
ipcMain.handle('shot:editor-fit', (event, size) => {
  const state = editorPanels.get(event.sender.id);
  if (!state || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height) ||
      size.width < 1 || size.width > 2000 || size.height < 1 || size.height > 2000)
    throw new Error('工具栏尺寸无效');
  const panel = state.editorPanel;
  const zoom = panel.webContents.getZoomFactor();
  const bounds = panel.getBounds();
  const area = screen.getDisplayNearestPoint(bounds).workArea;
  const width = Math.min(area.width, Math.ceil(size.width * zoom));
  const height = Math.min(area.height, Math.ceil(size.height * zoom));
  let x = bounds.x, y = bounds.y;
  if (!state.editorPanelFitted) {
    const picture = state.window.getBounds();
    x = picture.x;
    const below = picture.y + picture.height + 8;
    y = below + height <= area.y + area.height ? below : picture.y - height - 8;
    state.editorPanelFitted = true;
  }
  panel.setContentSize(width, height);
  panel.setPosition(
    Math.max(area.x, Math.min(x, area.x + area.width - width)),
    Math.max(area.y, Math.min(y, area.y + area.height - height))
  );
  if (state.editing) panel.show();
});
ipcMain.handle('shot:editor-state', (event, value) => {
  const state = sessions.get(event.sender.id);
  if (!state || state.selection) throw new Error('未知贴图');
  state.editorControls = value;
  if (state.editorPanel && !state.editorPanel.isDestroyed()) state.editorPanel.webContents.send('shot:editor-state', value);
});
ipcMain.handle('shot:editor-command', (event, value) => {
  const state = editorPanels.get(event.sender.id);
  if (!state?.editing || !value) throw new Error('编辑状态无效');
  const tools = ['select','pencil','line','arrow','rect','round','ellipse','text'];
  const properties = ['width','size','stroke','fill','use-stroke','use-fill'];
  if (!(value.type === 'tool' && tools.includes(value.value)) &&
      !(value.type === 'property' && properties.includes(value.name) && ['string','boolean'].includes(typeof value.value)) &&
      !['delete','done','escape'].includes(value.type)) throw new Error('编辑指令无效');
  state.window.webContents.send('shot:editor-command', value);
  if (value.type === 'tool') state.window.focus();
});
async function renderedImage(state) {
  if (!state.hasEdited) return state.image;
  const data = await state.window.webContents.executeJavaScript('window.screenshotEditor.exportPNG()');
  if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) throw new Error('图片合成失败');
  const image = nativeImage.createFromDataURL(data);
  if (image.isEmpty()) throw new Error('图片合成失败');
  return image;
}
ipcMain.handle('shot:editing', (event, value) => {
  const state = sessions.get(event.sender.id);
  if (!state || state.selection || typeof value !== 'boolean') throw new Error('编辑状态无效');
  setEditing(state, value);
});
ipcMain.handle('shot:list', async (event, kind) => {
  owner(event);
  const items = await sources(kind);
  return items
    .filter((item) => !item.thumbnail.isEmpty())
    .map((item) => ({
      id: item.id,
      name: item.name,
      dataUrl: item.thumbnail.resize({ width: 360 }).toDataURL()
    }));
});
async function capture(requester, kind, id, settings = preferences) {
  if (capturing) throw new Error('正在截图，请稍后重试');
  capturing = true;
  const hidden = [];
  try {
    if (settings.hideWindow && requester?.isVisible()) {
      hidden.push(requester);
      requester.hide();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const item = (await sources(kind)).find((source) => source.id === id);
    if (!item || item.thumbnail.isEmpty()) throw new Error('目标不可用，请刷新后重试');
    const display =
      kind === 'screen'
        ? screen.getAllDisplays().find((d) => String(d.id) === item.display_id)
        : null;
    const image = await captureImage(kind, item, display, settings);
    if (kind === 'screen') {
      if (!display) throw new Error('找不到对应屏幕');
      const overlay = create(image, display.bounds, true);
      // Keep the toolbox hidden until selection ends so it does not cover the frozen desktop.
      overlay.once('closed', () => {
        for (const window of hidden) if (!window.isDestroyed()) window.showInactive();
      });
      return true;
    }
    create(image);
    for (const window of hidden) if (!window.isDestroyed()) window.showInactive();
    return true;
  } catch (error) {
    for (const window of hidden) if (!window.isDestroyed()) window.showInactive();
    throw error;
  } finally {
    capturing = false;
  }
}
ipcMain.handle('shot:capture', (event, kind, id) => capture(owner(event), kind, id));
async function selectOnDesktop(requester, kind, settings) {
  if (capturing) return false;
  capturing = true;
  let hidden = false;
  try {
    if (settings.hideWindow && requester?.isVisible()) {
      requester.hide();
      hidden = true;
    }
    const result = await desktopPicker.select(kind, settings.includeCursor, settings.magnification, hidden);
    const output = typeof result === 'string' ? result : result.image;
    const bounds = typeof result === 'object' ? result.bounds : null;
    if (output === 'CANCEL') return false;
    const image = nativeImage.createFromBuffer(Buffer.from(output, 'base64'));
    if (image.isEmpty()) throw new Error('未能获取截图，请重试');
    const origin =
      Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite)
        ? screen.screenToDipPoint({ x: bounds[0], y: bounds[1] })
        : undefined;
    create(image, origin);
    return true;
  } finally {
    capturing = false;
    if (hidden && !requester.isDestroyed()) requester.showInactive();
  }
}
app.on('before-quit', () => {
  desktopPicker.stop();
  nativeMouse.stop();
});
async function start(requester, kind, settings) {
  if (!['screen', 'window'].includes(kind)) throw new Error('截图类型无效');
  if (process.platform === 'win32') nativeMouse.warm();
  if (process.platform === 'win32') return selectOnDesktop(requester, kind, settings);
  const items = await sources(kind);
  if (kind === 'screen') {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const target = items.find((item) => item.display_id === String(display.id));
    if (!target) throw new Error('找不到当前屏幕');
    return capture(requester, kind, target.id, settings);
  }
  throw new Error('鼠标悬停选择窗口目前仅支持 Windows');
}
ipcMain.handle('shot:configure', (event, value) => {
  owner(event);
  preferences = options(value);
});
ipcMain.handle('shot:prepare', async (event) => {
  owner(event);
  if (process.platform === 'win32') await desktopPicker.warm();
});
ipcMain.handle('shot:start', (event, kind, value) => {
  const requester = owner(event);
  preferences = options(value);
  return start(requester, kind, { ...preferences });
});
let activeTool;
function initialize(requester) {
  if (activeTool === requester) return;
  activeTool = requester;
  if (process.platform === 'win32')
    desktopPicker.warm().catch((error) => console.warn('截图模块初始化失败', error.message));
  const keys = ['CommandOrControl+Shift+R', 'CommandOrControl+Shift+W'];
  for (const [index, kind] of ['screen', 'window'].entries()) {
    if (
      !globalShortcut.register(keys[index], () => {
        if (requester.isDestroyed()) return;
        start(requester, kind, { ...preferences }).catch((error) => {
          if (!requester.isDestroyed())
            dialog.showMessageBox(requester, {
              type: 'error',
              message: '截图失败',
              detail: error.message
            });
        });
      })
    )
      console.warn('截图快捷键已被占用：' + keys[index]);
  }
  requester.once('closed', () => {
    if (activeTool !== requester) return;
    activeTool = null;
    for (const key of keys) globalShortcut.unregister(key);
    desktopPicker.stop();
  });
}
module.exports = { initialize };
ipcMain.handle('shot:ready', (event) => {
  const editor = editorPanels.get(event.sender.id);
  if (editor) return editor.editorControls || null;
  const panel = opacityPanels.get(event.sender.id);
  if (panel) return { opacity: Math.round(panel.state.opacity * 100) };
  const state = sessions.get(event.sender.id);
  if (!state) throw new Error('未知贴图');
  return {
    dataUrl: state.image.toDataURL(),
    selection: state.selection,
    border: state.border,
    viewport: state.viewport,
    project: state.project
  };
});
ipcMain.handle('shot:cancel', (event) => {
  const panel = opacityPanels.get(event.sender.id);
  if (panel) panel.panel.close();
  else sessions.get(event.sender.id)?.window.close();
});
ipcMain.handle('shot:opacity-fit', (event, height) => {
  const entry = opacityPanels.get(event.sender.id);
  if (!entry || !Number.isFinite(height) || height < 20 || height > 200)
    throw new Error('面板尺寸无效');
  const panel = entry.panel;
  const zoom = panel.webContents.getZoomFactor();
  panel.setContentSize(264, Math.ceil(height * zoom));
  const bounds = panel.getBounds();
  const area = screen.getDisplayNearestPoint(bounds).workArea;
  panel.setPosition(
    Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
    Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))
  );
  if (!entry.fitted) {
    entry.fitted = true;
    panel.show();
    panel.focus();
  }
});
ipcMain.handle('shot:opacity', (event, value) => {
  const entry = opacityPanels.get(event.sender.id);
  if (
    !entry ||
    entry.state.window.isDestroyed() ||
    !Number.isFinite(value) ||
    value < 10 ||
    value > 100
  )
    throw new Error('透明度参数无效');
  entry.state.opacity = value / 100;
  entry.state.window.setOpacity(entry.state.opacity);
});
ipcMain.handle('shot:crop', (event, rect) => {
  const state = sessions.get(event.sender.id);
  if (
    !state?.selection ||
    !rect ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key]))
  )
    throw new Error('区域无效');
  const size = state.image.getSize();
  const x = Math.max(0, Math.min(size.width - 1, Math.round(rect.x * size.width)));
  const y = Math.max(0, Math.min(size.height - 1, Math.round(rect.y * size.height)));
  const width = Math.min(size.width - x, Math.round(rect.width * size.width));
  const height = Math.min(size.height - y, Math.round(rect.height * size.height));
  if (width < 1 || height < 1) throw new Error('请选择有效区域');
  const image = state.image.crop({ x, y, width, height });
  const bounds = state.window.getBounds();
  const origin = {
    x: bounds.x + Math.round(rect.x * bounds.width),
    y: bounds.y + Math.round(rect.y * bounds.height)
  };
  state.window.close();
  create(image, origin);
});
