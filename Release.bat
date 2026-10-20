@echo off
setlocal
title Build Windows Release
pushd "%~dp0"
if errorlevel 1 goto directory_error

rem Support the standard Node.js installation even if PATH is not refreshed.
where npm.cmd >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node.exe >nul 2>nul
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto node_missing

node.exe scripts\release.cjs
if not "%errorlevel%"=="0" goto failed

echo.
start "" "%CD%\dist"
popd
pause
exit /b 0

:node_missing
echo.
echo Node.js and npm are required. Install Node.js LTS, then try again.
echo https://nodejs.org/
goto failed

:failed
echo.
echo Build failed. Review the error above, then run Release.bat again.
popd
pause
exit /b 1

:directory_error
echo Could not open the project folder.
pause
exit /b 1
