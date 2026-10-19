const fs = require('node:fs');
const path = require('node:path');

// electron-builder 在打包应用前写入日期，随应用封装，之后启动不会改变。
module.exports = async function stampBuild() {
  const buildDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  fs.writeFileSync(
    path.join(__dirname, '..', 'build-info.json'),
    JSON.stringify({ buildDate }, null, 2) + '\n'
  );
};
