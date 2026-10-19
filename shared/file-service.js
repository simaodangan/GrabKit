const { dialog } = require('electron');
const fs = require('node:fs/promises');
module.exports = {
  async openText(window) {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: '文本文件', extensions: ['txt', 'md', 'json', 'csv', 'html'] }]
    });
    if (result.canceled) return null;
    const filename = result.filePaths[0];
    if ((await fs.stat(filename)).size > 10_000_000) throw new Error('文件超过 10 MB');
    return {
      name: require('node:path').basename(filename),
      content: await fs.readFile(filename, 'utf8')
    };
  },
  async saveText(window, content) {
    if (typeof content !== 'string' || content.length > 10_000_000)
      throw new Error('文本无效或过大');
    const result = await dialog.showSaveDialog(window, { defaultPath: 'document.txt' });
    if (result.canceled) return false;
    await fs.writeFile(result.filePath, content, 'utf8');
    return true;
  }
};
