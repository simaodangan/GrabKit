const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function discoverTools(root) {
  const result = [];
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    try {
      const folder = path.join(root, directory.name);
      const metadata = JSON.parse(fs.readFileSync(path.join(folder, 'tool.json'), 'utf8'));
      if (
        typeof metadata.id !== 'string' ||
        !/^[a-z0-9-]+$/.test(metadata.id) ||
        metadata.id === 'home' ||
        typeof metadata.name !== 'string' ||
        !metadata.name ||
        typeof metadata.category !== 'string' ||
        !metadata.category
      )
        throw new Error('工具信息不完整或使用了保留 ID');
      const entry = path.resolve(folder, metadata.entry || 'index.html');
      const relative = path.relative(fs.realpathSync(folder), fs.realpathSync(entry));
      if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(entry) !== '.html')
        throw new Error('工具入口必须是目录内的 HTML');
      if (result.some((tool) => tool.id === metadata.id)) throw new Error('工具 ID 重复');
      result.push({
        id: metadata.id,
        name: String(metadata.name),
        category: String(metadata.category),
        description: String(metadata.description || ''),
        keywords: String(metadata.keywords || ''),
        icon: String(metadata.icon || '▦'),
        color: ['purple', 'blue', 'orange'].includes(metadata.color) ? metadata.color : 'purple',
        iconPath: fs.existsSync(path.join(folder, 'icon.png')) ? path.join(folder, 'icon.png') : null,
        iconUrl: fs.existsSync(path.join(folder, 'icon.png')) ? pathToFileURL(path.join(folder, 'icon.png')).href : null,
        entry
      });
    } catch (error) {
      console.warn(`跳过工具 ${directory.name}: ${error.message}`);
    }
  }
  return result;
}
module.exports = { discoverTools };
