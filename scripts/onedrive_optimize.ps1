# OneDrive Optimization Script for OpenTerminal
# Prevents OneDrive sync lockups and thrashing on transient runtime folders:
# - node_modules
# - web/.next
# - data (SQLite WAL/SHM files)
# - logs

$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       OpenTerminal OneDrive Optimization" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$targets = @(
    (Join-Path $projectRoot "node_modules"),
    (Join-Path $projectRoot "server\node_modules"),
    (Join-Path $projectRoot "web\node_modules"),
    (Join-Path $projectRoot "web\.next"),
    (Join-Path $projectRoot "logs")
)

foreach ($target in $targets) {
    if (Test-Path $target) {
        try {
            # Apply unpin attribute to avoid forced cloud syncing thrashing
            & attrib.exe +U -P "$target\*" /S /D 2>&1 | Out-Null
            Write-Host "[OK] Optimized OneDrive sync policy for: $target" -ForegroundColor Green
        } catch {
            Write-Host "[INFO] Skipped $target - $_" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n[RECOMMENDATION] In OneDrive Settings:" -ForegroundColor Yellow
Write-Host "1. Right click OneDrive icon in Windows taskbar -> Settings." -ForegroundColor Yellow
Write-Host "2. Under 'Sync and backup' -> 'Advanced settings' -> 'Exclude file types' or pause sync during heavy development." -ForegroundColor Yellow
Write-Host "3. The database file 'data\terminal.db' uses WAL mode. Running STOP.bat before closing ensures database checkpoints cleanly." -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan
