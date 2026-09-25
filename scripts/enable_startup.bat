@echo off
setlocal
title Enable OpenTerminal on Windows Startup
cd /d "%~dp0.."

echo ====================================================================
echo             Enable OpenTerminal Automatic Windows Startup           
echo ====================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
    "$startupFolder = [Environment]::GetFolderPath('Startup'); ^
     $shortcutPath = Join-Path $startupFolder 'OpenTerminal.lnk'; ^
     $startBat = Join-Path (Get-Location) 'START.bat'; ^
     $WshShell = New-Object -ComObject WScript.Shell; ^
     $shortcut = $WshShell.CreateShortcut($shortcutPath); ^
     $shortcut.TargetPath = $startBat; ^
     $shortcut.WorkingDirectory = (Get-Location).Path; ^
     $shortcut.Description = 'OpenTerminal Automatic Startup'; ^
     $shortcut.IconLocation = '$env:SystemRoot\system32\shell32.dll,15'; ^
     $shortcut.Save(); ^
     Write-Host '[SUCCESS] OpenTerminal shortcut added to Windows Startup folder:' -ForegroundColor Green; ^
     Write-Host '  ' $shortcutPath -ForegroundColor Cyan"

echo.
echo OpenTerminal will now launch automatically when you sign in to Windows.
echo.
pause
