const content = document.querySelector('#content');
content.innerHTML = `<div class="capture-panel" aria-busy="true"><div id="initializing" class="initializing" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span><span>截图工具正在初始化，请稍候…</span></div><div class="capture-actions"><button id="region" class="primary">自定义区域截图 <kbd>Ctrl+Shift+R</kbd></button><button id="window" class="primary">选中窗口截图 <kbd>Ctrl+Shift+W</kbd></button></div><div class="capture-options"><label><input id="cursor" type="checkbox" checked> 包含光标</label><label><input id="hide" type="checkbox" checked> 隐藏窗口</label></div></div>`;
const cursor = document.querySelector('#cursor');
const hide = document.querySelector('#hide');
const buttons = [...document.querySelectorAll('.capture-actions button')];
function settings() {
  return { includeCursor: cursor.checked, hideWindow: hide.checked };
}
function configure() {
  window.desktop.screenshots.configure(settings()).catch((error) => showToast(error.message));
}
cursor.onchange = configure;
hide.onchange = configure;
configure();
let busy = false;
buttons.forEach((button) => {
  button.disabled = true;
});
const initializing = document.querySelector('#initializing');
const capturePanel = document.querySelector('.capture-panel');
let prepared = false;
window.desktop.screenshots
  .prepare()
  .then(() => {
    prepared = true;
    buttons.forEach((button) => {
      button.disabled = false;
    });
    capturePanel.setAttribute('aria-busy', 'false');
    initializing.hidden = true;
    showToast('');
  })
  .catch((error) => {
    capturePanel.setAttribute('aria-busy', 'false');
    initializing.classList.add('initialization-error');
    initializing.textContent = '初始化失败，请关闭后重新打开截图工具。';
    showToast(`截图准备失败：${error.message}`);
  });
async function capture(kind) {
  if (busy || !prepared) return;
  busy = true;
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    await window.desktop.screenshots.start(kind, settings());
  } catch (error) {
    showToast(`截图失败：${error.message}`);
  } finally {
    busy = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}
buttons[0].onclick = () => capture('screen');
buttons[1].onclick = () => capture('window');
