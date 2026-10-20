const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');

async function pack() {
  const root = path.resolve(__dirname, '..');
  const artifacts = await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    publish: 'never',
  });
  console.log(`Windows 安装包已生成：\n${artifacts.join('\n')}`);
}

pack().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
