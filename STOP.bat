@echo off
setlocal
title OpenTerminal Stopper
chcp 65001 >nul

cd /d "%~dp0"

echo ====================================================================
echo                   OpenTerminal Application Stopper                  
echo ====================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"

echo.
if "%1"=="--no-pause" goto end
if "%1"=="-y" goto end

echo Press any key to close this window...
pause >nul

:end
exit /b 0
