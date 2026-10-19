const { clipboard, ClipboardItem } = require('electron');
const { Blob } = require('node:buffer');
module.exports = {
  readText: () => clipboard.readText(),
  writeText(text) {
    if (typeof text !== 'string' || text.length > 10_000_000)
      throw new Error('剪贴板文本无效或过大');
    return clipboard.writeText(text);
  },
  async writeImage(image) {
    if (!image || image.isEmpty()) throw new Error('图片为空，无法复制');
    await clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })
    ]);
  }
};
