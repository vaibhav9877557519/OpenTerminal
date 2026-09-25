@echo off
setlocal
title Disable OpenTerminal from Windows Startup

echo ====================================================================
echo             Disable OpenTerminal Automatic Windows Startup          
echo ====================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$startupFolder = [Environment]::GetFolderPath('Startup'); ^
     $shortcutPath = Join-Path $startupFolder 'OpenTerminal.lnk'; ^
     if (Test-Path $shortcutPath) { ^
         Remove-Item -Path $shortcutPath -Force; ^
         Write-Host '[SUCCESS] OpenTerminal removed from Windows Startup folder.' -ForegroundColor Green; ^
     } else { ^
         Write-Host '[INFO] OpenTerminal was not in the Windows Startup folder.' -ForegroundColor Yellow; ^
     }"

echo.
pause
