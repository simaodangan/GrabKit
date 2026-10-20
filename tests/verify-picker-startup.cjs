const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
const assert = require('node:assert/strict');
const child = spawn(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.resolve(__dirname, '../shared/capture-windows.ps1'),
    '-Server'
  ],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
);
let passed = 0;
let diagnostics = '';
const timeout = setTimeout(() => {
  console.error('截图层自动显示验证超时', diagnostics);
  child.kill();
  process.exitCode = 1;
}, 20000);
child.stderr.on('data', (data) => {
  diagnostics += data;
});
const lines = readline.createInterface({ input: child.stdout });
function request() {
  child.stdin.write(JSON.stringify({ mode: 'verify-auto-show' }) + '\n');
}
lines.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (message.type === 'ready') return request();
    assert.equal(message.type, 'result', message.message);
    assert.equal(message.image, 'AUTO_SHOW_OK');
    passed++;
    if (passed < 2) request();
    else child.stdin.end();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    child.kill();
  }
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  clearTimeout(timeout);
  if (code !== 0 || passed !== 2) {
    console.error('自动显示验证失败', { code, passed, diagnostics });
    process.exitCode = 1;
  } else console.log('隐藏后台进程检查通过：首次和第二次框选层均在无鼠标输入时主动显示并完成绘制');
});
