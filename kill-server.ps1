# kill-server.ps1 -- Kill the ai-stages server process
$ErrorActionPreference = "Stop"

# Read config for port
$configPath = Join-Path $env:USERPROFILE ".ai-stages" "config.json"
$port = 14780

if (Test-Path $configPath) {
    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($config.port) { $port = $config.port }
    } catch {
        Write-Host "WARNING: Could not parse config.json, using default port."
    }
}

# Find process listening on the port
$found = $false
try {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq "node") {
                Stop-Process -Id $proc.Id -Force
                Write-Host "Stopped node process (PID $($proc.Id)) on port $port."
                $found = $true
            }
        }
    }
} catch {
    Write-Host "ERROR: Failed to query port $port -- $_"
    exit 1
}

if (-not $found) {
    Write-Host "No node process found listening on port $port."
}
