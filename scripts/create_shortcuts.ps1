$projectRoot = Split-Path -Parent $PSScriptRoot
$startBat = Join-Path $projectRoot "START.bat"

Write-Host "Creating Desktop shortcut for OpenTerminal..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell

# Desktop paths
$desktopFolders = @(
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $env:USERPROFILE "Desktop"),
    (Join-Path $env:USERPROFILE "OneDrive\Desktop")
) | Select-Object -Unique

foreach ($desktop in $desktopFolders) {
    if (Test-Path $desktop) {
        $shortcutPath = Join-Path $desktop "OpenTerminal.lnk"
        $shortcut = $WshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $startBat
        $shortcut.WorkingDirectory = $projectRoot
        $shortcut.Description = "OpenTerminal - Market Dashboard Workspace"
        $shortcut.IconLocation = "$env:SystemRoot\system32\shell32.dll,15"
        $shortcut.Save()
        Write-Host "[SUCCESS] Created shortcut: $shortcutPath" -ForegroundColor Green
    }
}
