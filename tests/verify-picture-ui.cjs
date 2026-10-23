const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
app.disableHardwareAcceleration();
let opacity;
ipcMain.handle('shot:ready', event => ({ dataUrl: nativeImage.createFromBitmap(Buffer.from(Array(6).fill([0, 0, 255, 255]).flat()), { width: 3, height: 2 }).toDataURL(), selection: false, border: 3 }));
let submenuCalls = 0;
app.whenReady().then(async () => {
  try {
    const picture = new BrowserWindow({ width: 300, height: 200, frame: false, transparent: false, backgroundColor: '#7764d8', useContentSize: true, thickFrame: false, roundedCorners: false, show: false, webPreferences: { offscreen: true, preload: path.resolve(__dirname, '../tools/screenshot/backend/screenshot-preload.js'), contextIsolation: true, sandbox: true } });
    await picture.loadFile(path.resolve(__dirname, '../tools/screenshot/picture.html'));
    for (const zoom of [1, 1.25, 1.5]) {
      picture.webContents.setZoomFactor(zoom);
    for (const border of [2, 3, 4]) {
      picture.setContentSize(300 + border * 2, 200 + border * 2);
      await picture.webContents.executeJavaScript(`nativeViewport = null; borderWidth = ${border}; drawFrame()`);
      await new Promise(resolve => setTimeout(resolve, 80));
      const capture = await picture.webContents.capturePage();
      const { width, height } = capture.getSize();
      const pixels = capture.toBitmap();
      for (const [x, y] of [[0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)], [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1]]) {
        assert.deepEqual([...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)], [216, 100, 119], `边框 ${border}px 在 (${x},${y}) 缺失`);
      }
      const dpr = await picture.webContents.executeJavaScript('devicePixelRatio');
      const isBorder = (x,y) => { const index=(y*width+x)*4; return pixels[index]===216 && pixels[index+1]===100 && pixels[index+2]===119; };
      const scan = (x,y,dx,dy) => { let n=0; while(n<30 && isBorder(x+n*dx,y+n*dy)) n++; return n; };
      const expected = Math.round(border*dpr);
      for (const actual of [scan(0,Math.floor(height/2),1,0),scan(width-1,Math.floor(height/2),-1,0),scan(Math.floor(width/2),0,0,1),scan(Math.floor(width/2),height-1,0,-1)]) assert.equal(actual,expected, JSON.stringify({ border, dpr, width, height, expected, actual }));
      // Reproduce a native client area clipped one physical pixel short on right/bottom.
      await picture.webContents.executeJavaScript(`nativeViewport = [${width - 1}, ${height - 1}]; drawFrame()`);
      await new Promise(resolve => setTimeout(resolve, 80));
      const clipped = await picture.webContents.capturePage();
      const clippedPixels = clipped.toBitmap(); const stride = clipped.getSize().width;
      const checkPixel = (x,y) => { const p=(y*stride+x)*4; return clippedPixels[p]===216 && clippedPixels[p+1]===100 && clippedPixels[p+2]===119; };
      const clippedScan = (x,y,dx,dy) => { let n=0; while(n<30 && checkPixel(x+n*dx,y+n*dy)) n++; return n; };
      assert.equal(clippedScan(width-2,Math.floor((height-1)/2),-1,0),expected);
      assert.equal(clippedScan(Math.floor((width-1)/2),height-2,0,-1),expected);
    }
    }
    await picture.webContents.executeJavaScript('nativeViewport = null; drawFrame()');
    await new Promise(resolve => setTimeout(resolve, 80));
    const sample = await picture.webContents.capturePage();
    const pixels = sample.toBitmap(); const dimensions = sample.getSize();
    const purple = (x,y) => { const p=(y*dimensions.width+x)*4; return pixels[p]===216 && pixels[p+1]===100 && pixels[p+2]===119; };
    const thickness = (x,y,dx,dy) => { let n=0; while(n<30 && purple(x+n*dx,y+n*dy)) n++; return n; };
    const middleX=Math.floor(dimensions.width/2),middleY=Math.floor(dimensions.height/2);
    assert.equal(thickness(0,middleY,1,0),thickness(dimensions.width-1,middleY,-1,0));
    assert.equal(thickness(middleX,0,0,1),thickness(middleX,dimensions.height-1,0,-1));
    console.log('贴图界面检查通过：各缩放下边框四边像素完整，支持真实客户区裁切补偿');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('贴图界面验证超时'); app.exit(1); }, 20000);
