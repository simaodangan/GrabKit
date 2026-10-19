window.desktop
  .getAppInfo()
  .then((info) => {
    document.querySelector('#editor').textContent = info.editor;
    document.querySelector('#version').textContent = info.version;
    document.querySelector('#build-date').textContent = info.buildDate;
  })
  .catch(() => {
    document.querySelector('#build-date').textContent = '无法读取';
    document.querySelector('#status').textContent = '软件信息读取失败，请关闭后重新打开。';
  });
