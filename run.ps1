# run.ps1 -- Start Context & Launch server and open in browser app mode
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
$configPath = Join-Path (Join-Path $env:USERPROFILE ".context-launch") "config.json"
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $env:TEMP "context-launch"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$serverProcessFile = Join-Path $logDir "server-$port.process"

if (Test-Path $serverProcessFile) {
    $recorded = (Get-Content $serverProcessFile -Raw).Trim() -split '\s+'
    if ($recorded.Count -ne 2) {
        throw "$serverProcessFile is not a pid and a port. Delete it after confirming port $port is free."
    } else {
        $previousPid = [int]$recorded[0]
        $previousPort = [int]$recorded[1]
        $owningPid = Get-NetTCPConnection -LocalPort $previousPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty OwningProcess
        if ($owningPid -eq $previousPid) {
            Write-Host "Stopping the previous server on port $previousPort (process $previousPid)."
            Stop-Process -Id $previousPid -Force -ErrorAction SilentlyContinue
            $deadline = (Get-Date).AddSeconds(5)
            while (
                (Get-Date) -lt $deadline -and
                (Get-Process -Id $previousPid -ErrorAction SilentlyContinue)
            ) {
                Start-Sleep -Milliseconds 100
            }
            if (Get-Process -Id $previousPid -ErrorAction SilentlyContinue) {
                throw "Process $previousPid did not stop. Cannot safely clear .output."
            }
        } elseif ($owningPid) {
            throw "Port $previousPort belongs to process $owningPid, not recorded process $previousPid. Cannot safely clear .output."
        }
    }
}

# Check if port already in use
$portInUse = $false
try {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) { $portInUse = $true }
} catch {
    Write-Verbose "Port check failed: $_"
}

if (-not $portInUse) {
    # Install dependencies if needed
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

    function Test-OutputStale {
        $marker = ".output/server/index.mjs"
        if (-not (Test-Path $marker)) { return $true }
        $markerTime = (Get-Item $marker).LastWriteTime
        foreach ($sourcePath in @("src", "public", "app.config.ts", "package.json", "package-lock.json")) {
            if (-not (Test-Path $sourcePath)) { continue }
            $newer = Get-ChildItem -Path $sourcePath -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt $markerTime } |
                Select-Object -First 1
            if ($newer) { return $true }
        }
        return $false
    }

    $buildReason = ""
    if (-not (Test-Path ".output")) {
        $buildReason = "missing"
    } elseif (Test-OutputStale) {
        $buildReason = "stale"
    }
    if ($buildReason) {
        Write-Host $(if ($buildReason -eq "stale") {
            "Source files are newer than .output, rebuilding..."
        } else {
            "Building application..."
        })
        if ($env:RUN_SH_DRY_RUN -eq "1") {
            Write-Host "DRY_RUN: BUILD=yes REASON=$buildReason"
            Pop-Location
            exit 0
        }
        npx vinxi build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Build failed."
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    } elseif ($env:RUN_SH_DRY_RUN -eq "1") {
        Write-Host "DRY_RUN: BUILD=no"
        Pop-Location
        exit 0
    }

    # Start server hidden. The built entry only exports a request handler and
    # binds nothing, so scripts/serve.mjs is what opens the port.
    Write-Host "Starting server on port $port..."
    $env:PORT = $port
    $env:CONTEXT_LAUNCH_SERVER_PROCESS_FILE = $serverProcessFile
    $outLog = Join-Path $logDir "server-out.log"
    $errLog = Join-Path $logDir "server-err.log"
    $proc = Start-Process -PassThru -WindowStyle Hidden -FilePath "node" `
        -ArgumentList "scripts/serve.mjs" `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog

    function Exit-WithServerLog($message) {
        Write-Host "ERROR: $message"
        Write-Host "Server output ($logDir):"
        foreach ($log in @($outLog, $errLog)) {
            if (Test-Path $log) { Get-Content $log | Write-Host }
        }
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Wait for port to be listening
    $attempts = 0
    $maxAttempts = 30
    $listening = $false
    while ($attempts -lt $maxAttempts) {
        Start-Sleep -Milliseconds 500
        try {
            $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                Where-Object { $_.OwningProcess -eq $proc.Id } |
                Select-Object -First 1
            if ($conn) { $listening = $true; break }
        } catch {
            Write-Verbose "Port poll attempt ${attempts}: $_"
        }
        if ($proc.HasExited) {
            Exit-WithServerLog "Server exited (code $($proc.ExitCode)) before it started listening."
        }
        $attempts++
    }

    if (-not $listening) {
        Exit-WithServerLog "Server did not start within 15 seconds."
    }

    Pop-Location
} else {
    throw "Port $port is already in use by an untracked process. Cannot safely clear .output or rebuild."
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
        Start-Process -FilePath $browserName -ArgumentList "--guest", "--app=$appUrl"
        return $true
    }
    # Otherwise look up known browser locations
    $paths = $browserPaths[$browserName]
    if (-not $paths) { return $false }
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Start-Process -FilePath $p -ArgumentList "--guest", "--app=$appUrl"
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

Write-Host "Context & Launch running at $url"
