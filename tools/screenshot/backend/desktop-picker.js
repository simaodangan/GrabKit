const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

// Compile and initialize once, before a screenshot is requested. Commands arrive over stdin;
// choosing a region never depends on launching/activating a hidden PowerShell console.
let worker;
function launch() {
  if (worker) return worker;
  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'capture-windows.ps1'),
      '-Server'
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const state = { child, ready, pending: null, queue: Promise.resolve() };
  worker = state;
  let diagnostic = '';
  const timeout = setTimeout(() => {
    fail(new Error('截图模块初始化超时'));
    child.kill();
  }, 20000);
  function fail(error) {
    clearTimeout(timeout);
    rejectReady(error);
    if (state.pending) {
      state.pending.reject(error);
      state.pending = null;
    }
    if (worker === state) worker = null;
  }
  child.stderr.on('data', (data) => {
    diagnostic = (diagnostic + data).slice(-4000);
  });
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.on('exit', () => fail(new Error(diagnostic || '截图模块已退出，请重试')));
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (message.type === 'ready') {
        clearTimeout(timeout);
        resolveReady();
        return;
      }
      const pending = state.pending;
      if (!pending) return;
      state.pending = null;
      if (message.type === 'error') pending.reject(new Error(message.message));
      else if (message.type === 'result')
        pending.resolve({ image: message.image, bounds: message.bounds });
      else pending.reject(new Error('截图模块返回无效结果'));
    } catch {
      fail(new Error('截图模块通信失败'));
      child.kill();
    }
  });
  return state;
}
async function warm() {
  await launch().ready;
}
async function request(command) {
  const state = launch();
  await state.ready;
  const operation = state.queue.then(
    () =>
      new Promise((resolve, reject) => {
        state.pending = { resolve, reject };
        state.child.stdin.write(JSON.stringify(command) + '\n', (error) => {
          if (error && state.pending) {
            state.pending = null;
            reject(error);
          }
        });
      })
  );
  state.queue = operation.catch(() => {});
  return operation;
}
async function select(kind, includeCursor, magnification = 4, syncDesktop = false) {
  if (!['screen', 'window'].includes(kind) || typeof includeCursor !== 'boolean')
    throw new Error('截图参数无效');
  if (!Number.isInteger(magnification) || magnification < 2 || magnification > 8) throw new Error('放大倍数无效');
  return request({ mode: kind, cursor: includeCursor, magnification, syncDesktop, recipientProcessId: process.pid });
}
async function measure(handle) {
  return (await request({ mode: 'measure-window', handle })).image;
}
async function changeBorder(handle, delta) {
  return (await request({ mode: 'change-border', handle, delta })).image;
}
function stop() {
  const state = worker;
  worker = null;
  if (state) state.child.kill();
}
module.exports = { warm, select, measure, changeBorder, stop };
