@echo off
setlocal
cd /d "%~dp0"
echo TimePilot: lokale Windows-Dienste einrichten.
echo Bitte per Rechtsklick als Administrator ausfuehren.
echo Nur waehrend der Einrichtung bleibt dieses Fenster offen.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\install.ps1" %*
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Einrichtung fehlgeschlagen. Fehlermeldung oben beachten.
pause
exit /b %RESULT%