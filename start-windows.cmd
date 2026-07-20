@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte zuerst Node.js 24 LTS installieren.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installiere Projektabhaengigkeiten...
  call npm.cmd install
  if errorlevel 1 pause & exit /b 1
)
call npm.cmd run dev
