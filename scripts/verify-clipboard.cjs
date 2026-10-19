const { app, clipboard, ClipboardItem, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const service = require('../shared/clipboard');
app.whenReady().then(async () => {
  let saved;
  let wrote = false;
  let code = 0;
  try {
    saved = [];
    for (const item of await clipboard.read()) {
      const formats = {};
      for (const type of item.types) formats[type] = await item.getType(type);
      saved.push(new ClipboardItem(formats));
    }
    const image = nativeImage.createFromBitmap(
      Buffer.from(Array(6).fill([10, 20, 200, 255]).flat()),
      { width: 3, height: 2 }
    );
    wrote = true;
    await service.writeImage(image);
    assert.equal(await clipboard.has('image/png'), true);
    const item = (await clipboard.read()).find((item) => item.types.includes('image/png'));
    assert.ok(item);
    const png = await item.getType('image/png');
    const copied = nativeImage.createFromBuffer(Buffer.from(await png.arrayBuffer()));
    assert.deepEqual(copied.getSize(), { width: 3, height: 2 });
    assert.deepEqual(copied.toBitmap(), image.toBitmap());
    console.log('实际剪贴板检查通过：PNG 写入、读回、尺寸和像素一致');
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    if (wrote) {
      try {
        if (saved.length) await clipboard.write(saved);
        else clipboard.clear();
      } catch (error) {
        console.error('恢复原剪贴板失败', error);
        code = 1;
      }
    }
    app.exit(code);
  }
});
