const content = document.querySelector('#content');
content.innerHTML = `<div class="capture-panel" aria-busy="true"><div id="initializing" class="initializing" role="status" aria-live="polite"><span class="loading-spinner" aria-hidden="true"></span><span>截图工具正在初始化，请稍候…</span></div><div class="capture-actions"><button id="region" class="primary">开始截图 <kbd>Ctrl+Shift+R</kbd></button><button id="open-project">打开源文件…</button></div><p class="capture-help">单击截取窗口，按住拖动截取区域；右键取消。</p><div class="capture-options"><label><input id="cursor" type="checkbox" checked> 包含光标</label><label><input id="hide" type="checkbox" checked> 隐藏窗口</label></div><div class="capture-zoom"><label for="magnification">预览放大倍数</label><input id="magnification" type="range" min="2" max="8" step="1" value="4"><output id="magnification-value" for="magnification">4×</output></div></div>`;
const cursor = document.querySelector('#cursor');
const hide = document.querySelector('#hide');
const magnification = document.querySelector('#magnification');
const buttons = [document.querySelector('#region')];
const openProject = document.querySelector('#open-project');
openProject.onclick = async () => {
  openProject.disabled = true;
  try { await window.desktop.screenshots.openProject(); }
  catch (error) { showToast(`打开源文件失败：${error.message}`); }
  finally { openProject.disabled = false; }
};
function settings() {
  return { includeCursor: cursor.checked, hideWindow: hide.checked, magnification: Number(magnification.value) };
}
function configure() {
  window.desktop.screenshots.configure(settings()).catch((error) => showToast(error.message));
}
cursor.onchange = configure;
hide.onchange = configure;
magnification.oninput = () => {
  document.querySelector('#magnification-value').textContent = `${magnification.value}×`;
  configure();
};
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
