const status = document.querySelector('#status');
const startup = document.querySelector('#startup');
const swatches = document.querySelectorAll('[data-color]');
const customTheme = document.querySelector('#custom-theme');
function syncTheme() {
  const color = window.toolboxTheme.get();
  let preset = false;
  for (const swatch of swatches) {
    const selected = swatch.dataset.color === color;
    swatch.setAttribute('aria-pressed', String(selected));
    preset ||= selected;
  }
  customTheme.value = color;
  customTheme.parentElement.classList.toggle('selected', !preset);
}
function selectTheme(color) {
  const saved = window.toolboxTheme.set(color);
  syncTheme();
  status.textContent = saved ? '主题颜色已更新。' : '主题颜色已应用，但未能保存，下次打开将恢复默认。';
}
for (const swatch of swatches) swatch.onclick = () => selectTheme(swatch.dataset.color);
customTheme.addEventListener('input', () => selectTheme(customTheme.value));
window.addEventListener('themechange', syncTheme);
syncTheme();
async function loadStartup() {
  try {
    const state = await window.desktop.settings.getStartup();
    startup.checked = state.enabled;
    startup.disabled = !state.supported;
    if (!state.supported) document.querySelector('#startup-hint').textContent = '请在 Windows 正式运行包中设置开机自启动，开发模式不支持。';
  } catch {
    status.textContent = '读取开机自启动设置失败，请重新打开设置。';
  }
}
startup.onchange = async () => {
  const previous = !startup.checked;
  startup.disabled = true;
  try {
    const state = await window.desktop.settings.setStartup(startup.checked);
    startup.checked = state.enabled;
    status.textContent = state.enabled ? '已开启开机自启动。' : '已关闭开机自启动。';
  } catch {
    startup.checked = previous;
    status.textContent = '修改开机自启动失败，请重试或检查系统启动项设置。';
  } finally {
    startup.disabled = false;
  }
};
document.querySelector('#clear-config').onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await window.desktop.settings.clearCache();
    for (const key of ['favorites', 'recent', 'sidebarHidden', 'toolOrder', 'hiddenTools', 'themeColor']) localStorage.removeItem(key);
    window.toolboxTheme.set('#7460d6');
    syncTheme();
    status.textContent = '配置和缓存已清除，已恢复默认设置。';
  } catch {
    status.textContent = '配置和缓存未能全部清除，请重试。';
  } finally {
    button.disabled = false;
  }
};
loadStartup();
