[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $projectRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "       OpenTerminal Starting Sequence" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Project Directory: $projectRoot" -ForegroundColor DarkGray

# 1. Check Node.js and npm
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$npmPath  = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source

if (-not $nodePath) {
    Write-Host "[ERROR] Node.js is not found in PATH. Please install Node.js." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Detected Node.js: $(node -v) at $nodePath" -ForegroundColor Green

# 2. Ensure log directory exists
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "openterminal.log"

# 3. Load environment variables from .env
$envFile = Join-Path $projectRoot ".env"
if (Test-Path $envFile) {
    Write-Host "[INFO] Loading configuration from .env..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $varName = $parts[0].Trim()
            $varVal  = $parts[1].Trim()
            [Environment]::SetEnvironmentVariable($varName, $varVal, "Process")
        }
    }
}

# Chrome candidate paths
$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$targetChrome = $null
foreach ($path in $chromeCandidates) {
    if (Test-Path $path) {
        $targetChrome = $path
        break
    }
}
if (-not $targetChrome) {
    $found = (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source
    if ($found) { $targetChrome = $found }
}
$url = "http://localhost:3000"

function Open-Browser {
    if ($targetChrome) {
        Write-Host "[INFO] Opening Google Chrome: $url" -ForegroundColor Green
        Start-Process -FilePath $targetChrome -ArgumentList $url
    } else {
        Write-Host "[WARN] Google Chrome not found at standard path. Launching default browser: $url" -ForegroundColor Yellow
        Start-Process $url
    }
}

# 4. Check if already running on Port 3000 (Deduplication)
$port3000Conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port4000Conn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue

$isWebAlive = $false
if ($port3000Conn) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($res.StatusCode -eq 200) {
            $isWebAlive = $true
        }
    } catch {
        $isWebAlive = $false
    }
}

if ($isWebAlive) {
    Write-Host "[INFO] OpenTerminal is ALREADY running and responsive on http://localhost:3000" -ForegroundColor Green
    Write-Host "[INFO] Bringing up browser without starting duplicate processes..." -ForegroundColor Cyan
    Open-Browser
    Write-Host "===================================================" -ForegroundColor Cyan
    Write-Host "    OpenTerminal is Running at $url" -ForegroundColor Green
    Write-Host "    To stop OpenTerminal, run STOP.bat" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Cyan
    exit 0
}

# Clean any stale/unresponsive processes on ports 3000 or 4000
if ($port3000Conn -or $port4000Conn) {
    Write-Host "[WARN] Stale/unresponsive process detected on port 3000/4000. Cleaning up..." -ForegroundColor Yellow
    $conns = Get-NetTCPConnection -LocalPort 3000, 4000 -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        try {
            $p = $conn.OwningProcess
            if ($p -gt 4) {
                & taskkill.exe /PID $p /T /F 2>&1 | Out-Null
            }
        } catch {}
    }
    Start-Sleep -Seconds 1
}

# 5. Check if builds exist
$serverBuild = Join-Path $projectRoot "server\dist\index.js"
$webBuild    = Join-Path $projectRoot "web\.next"

if (-not (Test-Path $serverBuild)) {
    Write-Host "[INFO] Building backend server..." -ForegroundColor Yellow
    & npm.cmd run build -w server
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Backend build failed." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $webBuild)) {
    Write-Host "[INFO] Building web frontend..." -ForegroundColor Yellow
    & npm.cmd run build -w web
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Frontend build failed." -ForegroundColor Red
        exit 1
    }
}

# 6. Start OpenTerminal services (Detached background process with native file redirection)
Write-Host "[INFO] Starting OpenTerminal backend and frontend..." -ForegroundColor Cyan

"" | Out-File -FilePath $logFile -Encoding utf8 -Force

$proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npm run start > `"$logFile`" 2>&1" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru

if (-not $proc) {
    Write-Host "[ERROR] Failed to spawn process." -ForegroundColor Red
    exit 1
}

# Save PID
$pidData = @{
    cmd_pid    = $proc.Id
    started_at = (Get-Date).ToString("o")
} | ConvertTo-Json
$pidData | Out-File -FilePath (Join-Path $projectRoot "data\.process.json") -Encoding utf8 -Force

Write-Host "[INFO] Services launched (Parent PID: $($proc.Id)). Waiting for dashboard readiness..." -ForegroundColor Cyan

# 7. Wait until http://localhost:3000 is available
$maxAttempts = 45
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    $attempt++

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
}
Write-Host ""

if (-not $ready) {
    Write-Host "`n[ERROR] OpenTerminal failed to become available at http://localhost:3000 within $maxAttempts seconds." -ForegroundColor Red
    Write-Host "--- Recent Output Log ---" -ForegroundColor Yellow
    if (Test-Path $logFile) {
        Get-Content $logFile -Tail 25 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
    exit 1
}

Write-Host "[SUCCESS] OpenTerminal is ready on http://localhost:3000!" -ForegroundColor Green

# 8. Open Google Chrome
Open-Browser

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "    OpenTerminal is Running at $url" -ForegroundColor Green
Write-Host "    To stop OpenTerminal, run STOP.bat" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

exit 0
