document.querySelector('#clear-config').onclick = () => {
  const status = document.querySelector('#status');
  try {
    for (const key of ['favorites', 'recent', 'sidebarHidden', 'toolOrder'])
      localStorage.removeItem(key);
    status.textContent = '配置已清除，已恢复默认设置。';
  } catch {
    status.textContent = '配置清除失败，请重试。';
  }
};
