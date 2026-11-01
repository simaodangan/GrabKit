@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required. Please install Node.js first.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  call npm install
  if errorlevel 1 goto failed
  if not exist "node_modules\electron\dist\electron.exe" (
    call npm rebuild electron
    if errorlevel 1 goto failed
  )
)
call npm start
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Startup failed. See the error above.
pause
exit /b 1
