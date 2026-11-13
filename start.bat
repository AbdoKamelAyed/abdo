@echo off
rem Builds the site for this computer and opens it in your browser. Close this window to stop.
rem (Written for Windows; not tested on a real Windows machine.)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:4173/"
call npm run dev
pause
