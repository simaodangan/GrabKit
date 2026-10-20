const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

// Check only this project's executables; leave other Electron apps alone.
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
  $projectRoot = (Get-Location).Path
  $runtimePrefix = [IO.Path]::Combine($projectRoot, 'node_modules', 'electron', 'dist') + '\\'
  $outputPrefix = [IO.Path]::Combine($projectRoot, 'dist') + '\\'
  try {
    $running = @(Get-Process -ErrorAction Stop | Where-Object {
      $exe = $_.Path
      $exe -and ($exe.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $exe.StartsWith($outputPrefix, [StringComparison]::OrdinalIgnoreCase))
    })
    if ($running.Count -gt 0) {
      Write-Host 'Please exit the app from the system tray and close its debug sessions, then retry.'
      $running | Select-Object Id, ProcessName, Path | Format-Table -AutoSize
      exit 1
    }
  } catch {
    Write-Host $_
    exit 1
  }
`]);

for (const [label, command] of [
  ['[1/3] Installing dependencies...', 'ci --no-audit --no-fund'],
  ['[2/3] Checking application files...', 'run check'],
  ['[3/3] Building Windows installer...', 'run pack:win']
]) {
  console.log(label);
  // cmd is required for npm.cmd on Windows. Commands here are fixed strings.
  run('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${command}`]);
}
console.log(`\nBuild completed. Installer location:\n${path.join(root, 'dist')}`);
