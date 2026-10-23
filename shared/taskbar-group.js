const APP_ID = 'com.electron.electrontoolbox';

function setTaskbarGroup(window, group = 'main') {
  if (process.platform !== 'win32') return;
  window.setAppDetails({ appId: group === 'main' ? APP_ID : `${APP_ID}.tool.${group}` });
}

module.exports = { setTaskbarGroup };
