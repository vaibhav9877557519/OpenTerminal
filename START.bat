@echo off
setlocal
title OpenTerminal Launcher
chcp 65001 >nul

cd /d "%~dp0"

echo ====================================================================
echo                   OpenTerminal Application Launcher                 
echo ====================================================================
echo Working Directory: %~dp0
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 (
    echo ====================================================================
    echo [ERROR] OpenTerminal failed to launch successfully.
    echo Please inspect the output above and logs\openterminal.err.log
    echo ====================================================================
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo [INFO] OpenTerminal is running in the background.
echo [INFO] You can close this window now.
ping 127.0.0.1 -n 4 >nul
exit /b 0
