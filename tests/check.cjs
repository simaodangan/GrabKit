const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
require('./check-startup.cjs');
require('./check-screenshot-resident.cjs');
require('./check-taskbar-group.cjs');
const root = path.join(__dirname, '..');
function checkDirectory(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) checkDirectory(file);
    else if (/\.(js|cjs)$/.test(item.name))
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    else if (item.name.endsWith('.html')) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) {
        if (!match[1].includes(':'))
          assert.ok(
            fs.existsSync(path.resolve(directory, match[1])),
            `资源缺失：${file}: ${match[1]}`
          );
      }
    }
  }
}
for (const file of ['main.js', 'preload.js'])
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
for (const directory of ['app', 'shared', 'tools']) checkDirectory(path.join(root, directory));
console.log('脚本语法及 HTML 资源引用检查通过');
const { discoverTools } = require('../shared/tool-registry');
const registered = discoverTools(path.join(root, 'tools'));
assert.deepEqual(registered.map((tool) => tool.id).sort(), ['formula-converter', 'screenshot']);
for (const tool of registered) {
  assert.ok(tool.iconPath && fs.existsSync(tool.iconPath), `${tool.id} 缺少统一图标`);
  assert.equal(require('node:url').fileURLToPath(tool.iconUrl), tool.iconPath);
  const icon = fs.readFileSync(tool.iconPath);
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
}
console.log('工具发现检查通过：仅保留屏幕截图和 GPT 论文公式转 Word');
