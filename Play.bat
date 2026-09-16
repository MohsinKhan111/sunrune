@echo off
title SUNRUNE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   SUNRUNE needs Node.js to run.
  echo   Get it from https://nodejs.org then double-click Play.bat again.
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting SUNRUNE... your browser will open in a moment.
echo   Keep this window open while you play. Close it to stop the game.
echo.
node tools\serve.mjs --open
pause
