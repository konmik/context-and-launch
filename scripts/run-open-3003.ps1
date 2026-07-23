Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Launch the local Vinxi development server on the project-specific port and open Chrome.
$port = 3003
$listenAddress = "127.0.0.1"
$url = "http://${listenAddress}:$port"
$repoRoot = Split-Path -Parent $PSScriptRoot
$vinxiPath = Join-Path $repoRoot "node_modules\vinxi\bin\cli.mjs"
$logDirectory = Join-Path $repoRoot ".vinxi"
$logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutPath = Join-Path $logDirectory "run-open-$port-$logStamp.stdout.log"
$stderrPath = Join-Path $logDirectory "run-open-$port-$logStamp.stderr.log"

if (-not (Test-Path -LiteralPath $vinxiPath)) {
    throw "Vinxi is not installed. Run npm install before starting the dev server."
}

$existingListeners = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
)
$existingProcessIds = @(
    $existingListeners |
        Select-Object -ExpandProperty OwningProcess -Unique
)

foreach ($existingProcessId in $existingProcessIds) {
    Stop-Process -Id $existingProcessId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped existing process $existingProcessId on port $port"
}

$portReleaseDeadline = [DateTime]::UtcNow.AddSeconds(5)
while (
    (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) -and
    [DateTime]::UtcNow -lt $portReleaseDeadline
) {
    Start-Sleep -Milliseconds 100
}

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port did not become available after stopping its existing process."
}

$chromeCandidates = @()
$chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
if ($chromeCommand) {
    $chromeCandidates += $chromeCommand.Source
}

foreach ($basePath in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($basePath) {
        $chromeCandidates += Join-Path $basePath "Google\Chrome\Application\chrome.exe"
    }
}

$chromePath = $chromeCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1

if (-not $chromePath) {
    throw "Google Chrome was not found."
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$quotedVinxiPath = "`"$vinxiPath`""
$originalHostEnvironmentValue = [Environment]::GetEnvironmentVariable(
    "HOST",
    [EnvironmentVariableTarget]::Process
)
[Environment]::SetEnvironmentVariable(
    "HOST",
    $listenAddress,
    [EnvironmentVariableTarget]::Process
)
try {
    $devProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList @($quotedVinxiPath, "dev", "--port", "$port") `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -WindowStyle Hidden `
        -PassThru
}
finally {
    [Environment]::SetEnvironmentVariable(
        "HOST",
        $originalHostEnvironmentValue,
        [EnvironmentVariableTarget]::Process
    )
}

$deadline = [DateTime]::UtcNow.AddSeconds(30)
$ready = $false
$lastStartupError = "No HTTP response received."

while ([DateTime]::UtcNow -lt $deadline) {
    if ($devProcess.HasExited) {
        $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -LiteralPath $stdoutPath } else { "" }
        $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { "" }
        throw "Dev server exited with code $($devProcess.ExitCode).`n$stderr`n$stdout"
    }

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
        $lastStartupError = "Received HTTP status $($response.StatusCode)."
    }
    catch {
        $lastStartupError = $_.Exception.Message
    }

    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    if (-not $devProcess.HasExited) {
        Stop-Process -Id $devProcess.Id
    }
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -LiteralPath $stdoutPath } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { "" }
    throw "Dev server did not become ready at $url within 30 seconds. Last error: $lastStartupError`n$stderr`n$stdout"
}

Start-Process -FilePath $chromePath -ArgumentList $url

Write-Output "Dev server started at $url"
Write-Output "Process ID: $($devProcess.Id)"
Write-Output "Logs: $stdoutPath and $stderrPath"
