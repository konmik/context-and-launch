# run.ps1 -- Start ai-stages server and open in browser app mode
$ErrorActionPreference = "Stop"

# Check Node.js version
try {
    $nodeVersion = (node --version 2>$null)
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH."
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed or not in PATH."
    Read-Host "Press Enter to exit"
    exit 1
}

$major = [int]($nodeVersion -replace '^v','').Split('.')[0]
if ($major -lt 20) {
    Write-Host "ERROR: Node.js >= 20 required (found $nodeVersion)."
    Read-Host "Press Enter to exit"
    exit 1
}

# Read config
$configPath = Join-Path $env:USERPROFILE ".ai-stages" "config.json"
$port = 14780
$browser = "chrome"

if (Test-Path $configPath) {
    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($config.port) { $port = $config.port }
        if ($config.browser) { $browser = $config.browser }
    } catch {
        Write-Host "WARNING: Could not parse config.json, using defaults."
    }
}

$url = "http://localhost:$port"

# Check if port already in use
$portInUse = $false
try {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) { $portInUse = $true }
} catch {
    Write-Verbose "Port check failed: $_"
}

if (-not $portInUse) {
    # Install dependencies if needed
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Push-Location $scriptDir

    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: npm install failed."
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    }

    # Build if needed
    if (-not (Test-Path ".output")) {
        Write-Host "Building application..."
        npx vinxi build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Build failed."
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    }

    # Start server hidden
    Write-Host "Starting server on port $port..."
    $env:PORT = $port
    Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList ".output/server/index.mjs"

    # Wait for port to be listening
    $attempts = 0
    $maxAttempts = 30
    while ($attempts -lt $maxAttempts) {
        Start-Sleep -Milliseconds 500
        try {
            $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($conn) { break }
        } catch {
            Write-Verbose "Port poll attempt ${attempts}: $_"
        }
        $attempts++
    }

    if ($attempts -ge $maxAttempts) {
        Write-Host "ERROR: Server did not start within 15 seconds."
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 1
    }

    Pop-Location
}

# Open browser in app mode
Write-Host "Opening browser..."
$opened = $false

$browserPaths = @{
    "chrome" = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )
    "msedge" = @(
        "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
}

function Open-BrowserApp($browserName, $appUrl) {
    # If the browser value is a direct path to an executable, use it
    if (Test-Path $browserName) {
        Start-Process -FilePath $browserName -ArgumentList "--app=$appUrl"
        return $true
    }
    # Otherwise look up known browser locations
    $paths = $browserPaths[$browserName]
    if (-not $paths) { return $false }
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Start-Process -FilePath $p -ArgumentList "--app=$appUrl"
            return $true
        }
    }
    return $false
}

$opened = Open-BrowserApp $browser $url

if (-not $opened -and $browser -ne "msedge") {
    $opened = Open-BrowserApp "msedge" $url
}

if (-not $opened) {
    Start-Process $url
}

Write-Host "ai-stages running at $url"
