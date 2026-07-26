param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("unit", "gate", "e2e", "all", "shell", "bench")]
  [string]$Suite
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ramdisk-drive.ps1")

# The workspace is a read-mostly mirror the OS file cache already keeps hot, so it lives on
# the local disk and is refreshed incrementally. Only the runtime - the temporary files,
# sandboxed data directory and caches a run churns through - goes on the RAM disk.
$source = Split-Path $PSScriptRoot -Parent
if (-not $env:LOCALAPPDATA) {
  throw "LOCALAPPDATA is not set; the test workspace has nowhere to live."
}
$workspaceRoot = Join-Path $env:LOCALAPPDATA "context-launch-tests"
$runtimeRoot = "T:\context-launch-tests"
$markerName = ".managed-by-context-launch"
$lockName = ".run-lock"
$requiredRuntimeFreeSpace = 700MB

function ConvertTo-PathSegment {
  param([string]$Value)

  $segment = ($Value -replace "[^A-Za-z0-9._-]", "-") -replace "-+", "-"
  $segment = $segment.Trim("-.")
  if (-not $segment) {
    throw "Cannot derive a directory name from '$Value'."
  }
  return $segment
}

function Get-SourceBranch {
  $branch = (& git -C $source rev-parse --abbrev-ref HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot read the current branch of $source; the test workspace is keyed by branch."
  }
  $branch = $branch.Trim()
  if ($branch -ne "HEAD") {
    return $branch
  }
  $commit = (& git -C $source rev-parse --short HEAD 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot read the current commit of $source; the test workspace is keyed by branch."
  }
  return "detached-$($commit.Trim())"
}

function Test-RunLockAlive {
  param([string]$Directory)

  $lockFile = Join-Path $Directory $lockName
  if (-not (Test-Path $lockFile)) {
    return $false
  }
  try {
    $lock = Get-Content $lockFile -Raw | ConvertFrom-Json
    $process = Get-Process -Id $lock.ProcessId -ErrorAction Stop
    return $process.StartTime.Ticks -eq $lock.StartTicks
  } catch {
    return $false
  }
}

function Initialize-ManagedDirectory {
  param([string]$Directory)

  New-Item -ItemType Directory -Force $Directory | Out-Null
  $marker = Join-Path $Directory $markerName
  if (-not (Test-Path $marker)) {
    if ((Get-ChildItem $Directory -Force).Count -ne 0) {
      throw "$Directory contains data not created by this test runner. Move it before running tests."
    }
    Set-Content -Path $marker -Value "Context & Launch test workspace"
  }
}

function Get-ManagedRunDirectories {
  param([string]$Root)

  if (-not (Test-Path $Root)) {
    return @()
  }
  $projectDirectories = @(Get-ChildItem $Root -Directory -ErrorAction SilentlyContinue)
  $runDirectories = @()
  foreach ($projectDirectory in $projectDirectories) {
    $runDirectories += @(Get-ChildItem $projectDirectory.FullName -Directory -ErrorAction SilentlyContinue)
  }
  return @($runDirectories | Where-Object { Test-Path (Join-Path $_.FullName $markerName) })
}

function Remove-StaleRuntimeDirectories {
  param([string]$KeepDirectory)

  $stale = @(Get-ManagedRunDirectories -Root $runtimeRoot |
    Where-Object { $_.FullName -ne $KeepDirectory -and -not (Test-RunLockAlive $_.FullName) } |
    Sort-Object LastWriteTime)

  foreach ($directory in $stale) {
    $drive = Get-TestRamDiskInfo
    if ($drive -and $drive.AvailableFreeSpace -ge $requiredRuntimeFreeSpace) {
      return
    }
    Write-Host "Reclaiming space from the idle test runtime $($directory.FullName)."
    Remove-Item $directory.FullName -Recurse -Force
  }
}

$driveStatus = Get-TestRamDiskStatus -DriveInfo (Get-TestRamDiskInfo)
switch ($driveStatus) {
  "Missing" {
    throw "The T: RAM disk does not exist. Run npm run test:ramdisk:create first."
  }
  "Invalid" {
    throw "T: is not the Temp NTFS RAM disk."
  }
}

$runSegments = Join-Path `
  (ConvertTo-PathSegment (Split-Path $source -Leaf)) `
  (ConvertTo-PathSegment (Get-SourceBranch))
$workspaceRun = Join-Path $workspaceRoot $runSegments
$runtimeRun = Join-Path $runtimeRoot $runSegments
$workspace = Join-Path $workspaceRun "workspace"
$lockFile = Join-Path $workspaceRun $lockName

Initialize-ManagedDirectory $workspaceRun
if (Test-RunLockAlive $workspaceRun) {
  throw "Another test run is already using $workspaceRun. Wait for it to finish."
}
Set-Content -Path $lockFile -Value (
  [pscustomobject]@{
    ProcessId = $PID
    StartTicks = (Get-Process -Id $PID).StartTime.Ticks
  } | ConvertTo-Json -Compress
)

try {
  Remove-StaleRuntimeDirectories -KeepDirectory $runtimeRun
  if ((Get-TestRamDiskStatus -DriveInfo (Get-TestRamDiskInfo) `
        -MinimumAvailableFreeSpace $requiredRuntimeFreeSpace) -eq "InsufficientSpace") {
    throw "The T: RAM disk requires at least 700 MB of free space to run the test suite."
  }

  # A run must not inherit the previous run's data directory, logs or temporary files.
  if (Test-Path $runtimeRun) {
    Remove-Item $runtimeRun -Recurse -Force
  }
  Initialize-ManagedDirectory $runtimeRun
  New-Item -ItemType Directory -Force $workspace | Out-Null

  $excludedDirectories = @(
    ".output",
    ".pi-subagents",
    ".playwright-mcp",
    ".vinxi",
    "build",
    "coverage",
    "dist",
    "dist-electron",
    "temp",
    "test-results"
  ) | ForEach-Object { Join-Path $source $_ }
  $robocopyArguments = @(
    $source,
    $workspace,
    "/MIR",
    "/COPY:DAT",
    "/DCOPY:DAT",
    "/R:2",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/XD"
  ) + $excludedDirectories
  & robocopy @robocopyArguments | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Failed to mirror the workspace to $workspace; robocopy exited with code $LASTEXITCODE."
  }

  $tempDirectory = Join-Path $runtimeRun "temp"
  $cacheDirectory = Join-Path $runtimeRun "cache"
  $dataDirectory = Join-Path $runtimeRun "data"
  $homeDirectory = Join-Path $runtimeRun "home"
  New-Item -ItemType Directory -Force $tempDirectory, $cacheDirectory, $dataDirectory, $homeDirectory | Out-Null

  # The sandboxed HOME hides the developer's global git identity, and a repository the tests
  # clone has no per-repository identity to fall back on. The sandbox supplies its own so a
  # run never depends on how the machine happens to be configured.
  Set-Content -Path (Join-Path $homeDirectory ".gitconfig") -Value @"
[user]
	name = Context Launch Tests
	email = tests@context-launch.invalid
"@

  $tempProbe = Join-Path $tempDirectory ".write-test-$PID"
  try {
    [IO.File]::WriteAllText($tempProbe, "")
  } finally {
    if (Test-Path $tempProbe) {
      Remove-Item $tempProbe
    }
  }

  $env:TEMP = $tempDirectory
  $env:TMP = $tempDirectory
  $env:TMPDIR = $tempDirectory
  if ([IO.Path]::GetTempPath().TrimEnd("\") -ne $tempDirectory.TrimEnd("\")) {
    throw "Windows did not resolve the test temporary directory to $tempDirectory."
  }
  $env:HOME = $homeDirectory
  $env:XDG_CACHE_HOME = $cacheDirectory
  $env:NPM_CONFIG_CACHE = Join-Path $cacheDirectory "npm"
  $env:NPM_CONFIG_LOGS_MAX = "0"
  $env:CONTEXT_LAUNCH_DATA_DIR = $dataDirectory

  $workspaceScripts = @{
    unit = "test:workspace"
    gate = "test:gate:workspace"
    e2e = "test:e2e:workspace"
    all = "test:all:workspace"
    shell = "test:shell:workspace"
    bench = "bench:workspace"
  }

  Push-Location $workspace
  try {
    & npm.cmd run $workspaceScripts[$Suite]
    $suiteExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path $lockFile) {
    Remove-Item $lockFile -Force
  }
}

exit $suiteExitCode
