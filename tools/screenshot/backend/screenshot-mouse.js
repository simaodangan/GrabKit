const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const targets = new Map();
let worker;
function launch() {
  if (worker) return worker;
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'screenshot-mouse.ps1')
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  worker = child;
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
  const fail = error => {
    if (worker !== child) return;
    worker = null;
    console.warn('截图鼠标提醒不可用', error?.message || diagnostic);
  };
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', () => fail());
  readline.createInterface({ input: child.stdout }).on('line', line => {
    if (worker !== child) return;
    const [handle, action] = line.trim().split(' ');
    targets.get(handle)?.(action);
  });
  for (const handle of targets.keys()) child.stdin.write(`add ${handle}\n`);
  return child;
}
function watch(window, callback) {
  const handle = window.getNativeWindowHandle().readBigUInt64LE().toString();
  targets.set(handle, callback);
  if (worker) worker.stdin.write(`add ${handle}\n`);
  else launch();
  window.once('closed', () => {
    targets.delete(handle);
    if (!targets.size) {
      const child = worker;
      worker = null;
      child?.kill();
    } else if (worker) worker.stdin.write(`remove ${handle}\n`);
  });
}
function stop() {
  const child = worker;
  worker = null;
  child?.kill();
}
module.exports = { watch, warm: launch, stop };
