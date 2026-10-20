const STARTUP_NAME = 'electrontoolbox';
const STARTUP_ARG = '--autostart';

function isAutoStart(args) {
  return args.includes(STARTUP_ARG);
}

function readStartupEnabled(app, executablePath) {
  // Electron parses this option as a command line, so quote paths with spaces.
  const state = app.getLoginItemSettings({ path: `"${executablePath}"`, args: [] });
  // openAtLogin checks Electron's default registry name, ignoring our custom name.
  return (state.launchItems || []).some(
    (item) => item.name === STARTUP_NAME && item.scope === 'user' && item.enabled &&
      (item.args.length === 0 || (item.args.length === 1 && isAutoStart(item.args)))
  );
}

module.exports = { STARTUP_NAME, STARTUP_ARG, isAutoStart, readStartupEnabled };
