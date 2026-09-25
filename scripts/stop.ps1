[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $projectRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       OpenTerminal Stopping Sequence" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$stoppedAny = $false

# 1. Stop recorded PID process tree if present
$pidFile = Join-Path $projectRoot "data\.process.json"
if (Test-Path $pidFile) {
    try {
        $pidInfo = Get-Content $pidFile -Raw | ConvertFrom-Json
        $rootPid = $pidInfo.cmd_pid
        if (-not $rootPid) { $rootPid = $pidInfo.npm_pid }
        if ($rootPid) {
            $proc = Get-Process -Id $rootPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "[INFO] Stopping OpenTerminal process tree (PID: $rootPid)..." -ForegroundColor Yellow
                & taskkill.exe /PID $rootPid /T /F 2>&1 | Out-Null
                $stoppedAny = $true
            }
        }
    } catch {}
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Terminate any node/npm/cmd processes specifically listening on port 3000 or 4000
$ports = @(3000, 4000)
$conns = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue

if ($conns) {
    $pidsToKill = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pidsToKill) {
        if ($p -and $p -gt 4) {
            try {
                $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                # Only terminate if process is Node.js, npm, or cmd associated with OpenTerminal
                if ($proc -and ($proc.ProcessName -match "node|npm|cmd")) {
                    Write-Host "[INFO] Stopping OpenTerminal service process $($p) ($($proc.ProcessName)) on port 3000/4000..." -ForegroundColor Yellow
                    & taskkill.exe /PID $p /T /F 2>&1 | Out-Null
                    $stoppedAny = $true
                }
            } catch {
                Write-Host "[WARN] Could not terminate process $($p) - $_" -ForegroundColor DarkGray
            }
        }
    }
}

Start-Sleep -Seconds 1

# 3. Verify ports are free
$remaining = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue

if (-not $remaining) {
    Write-Host "[SUCCESS] OpenTerminal stopped successfully." -ForegroundColor Green
    Write-Host "[SUCCESS] Ports 3000 and 4000 are now free." -ForegroundColor Green
} else {
    Write-Host "[WARN] Ports 3000/4000 may still be held by:" -ForegroundColor Yellow
    $remaining | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table | Out-String | Write-Host -ForegroundColor DarkGray
}

Write-Host "===================================================" -ForegroundColor Cyan
exit 0
