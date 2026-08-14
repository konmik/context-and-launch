param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("unit", "gate", "e2e", "all", "shell", "bench")]
  [string]$Suite
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ramdisk-drive.ps1")

$source = Split-Path $PSScriptRoot -Parent
if (-not $env:LOCALAPPDATA) {
  throw "LOCALAPPDATA is not set; the test workspace has nowhere to live."
}
$workspaceRoot = Join-Path $env:LOCALAPPDATA "context-launch-tests"
$ramDiskRuntimeRoot = "T:\context-launch-tests"
$diskRuntimeRoot = Join-Path $env:LOCALAPPDATA "context-launch-test-runtime"
$markerName = ".managed-by-context-launch"
$activeMarkerName = ".context-launch-test-workspace.json"
$lockName = ".run-lock"
$requiredRuntimeFreeSpace = 200MB

function Mount-TestRuntime {
  param([string]$Directory)

  foreach ($letter in @("Z", "Y", "X", "W", "V", "U")) {
    $drive = "${letter}:"
    if (Test-Path "$drive\") {
      continue
    }
    & subst.exe $drive $Directory
    if ($LASTEXITCODE -eq 0) {
      return $drive
    }
  }
  throw "No drive letter from U: through Z: is available for the isolated test runtime."
}

function Test-RunLockHeld {
  param([string]$Directory)

  $lockFile = Join-Path $Directory $lockName
  if (-not (Test-Path $lockFile)) {
    return $false
  }
  try {
    $probe = [IO.File]::Open($lockFile, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $probe.Dispose()
    return $false
  } catch [IO.IOException] {
    return $true
  }
}

function Initialize-ManagedDirectory {
  param(
    [string]$Directory,
    [string]$Kind
  )

  New-Item -ItemType Directory -Force $Directory | Out-Null
  $marker = Join-Path $Directory $markerName
  if (Test-Path $marker) {
    Assert-ManagedDirectory -Directory $Directory -Kind $Kind
    return
  }
  if ((Get-ChildItem $Directory -Force).Count -ne 0) {
    throw "$Directory contains data not created by this test runner. Move it before running tests."
  }
  $ownership = [ordered]@{
    ManagedBy = "context-launch-test-runner"
    Version = 1
    Kind = $Kind
    Directory = [IO.Path]::GetFullPath($Directory).TrimEnd("\")
    WorkspaceKey = $identity.workspaceKey
    SourcePath = $identity.sourcePath
    SourceRef = $identity.sourceRef
  }
  Set-Content -Path $marker -Value ($ownership | ConvertTo-Json -Compress) -NoNewline
}

function Assert-ManagedDirectory {
  param(
    [string]$Directory,
    [string]$Kind,
    [switch]$AllowOtherIdentity
  )

  $marker = Join-Path $Directory $markerName
  try {
    $ownership = Get-Content $marker -Raw | ConvertFrom-Json
  } catch {
    throw "Refusing to manage $Directory because its ownership marker is missing or malformed."
  }
  $expectedDirectory = [IO.Path]::GetFullPath($Directory).TrimEnd("\")
  if (
    $ownership.ManagedBy -ne "context-launch-test-runner" -or
    $ownership.Version -ne 1 -or
    $ownership.Kind -ne $Kind -or
    $ownership.Directory -ne $expectedDirectory -or
    $ownership.WorkspaceKey -ne (Split-Path $Directory -Leaf) -or
    -not ($ownership.SourcePath -is [string]) -or
    -not ($ownership.SourceRef -is [string])
  ) {
    throw "Refusing to manage $Directory because its ownership marker does not match this test workspace."
  }
  if (
    -not $AllowOtherIdentity -and (
      $ownership.WorkspaceKey -ne $identity.workspaceKey -or
      $ownership.SourcePath -ne $identity.sourcePath -or
      $ownership.SourceRef -ne $identity.sourceRef
    )
  ) {
    throw "Refusing to manage $Directory because its ownership marker belongs to another test workspace."
  }
}

function Get-ManagedRunDirectories {
  param([string]$Root)

  if (-not (Test-Path $Root)) {
    return @()
  }
  return @(Get-ChildItem $Root -Directory -ErrorAction SilentlyContinue)
}

function Get-WorkspaceRunDirectory {
  param([string]$RuntimeDirectory)

  $relative = $RuntimeDirectory.Substring($runtimeStorageRoot.Length).TrimStart("\")
  return Join-Path $workspaceRoot $relative
}

function Remove-StaleRuntimeDirectories {
  param([string]$KeepDirectory)

  $stale = @(Get-ManagedRunDirectories -Root $runtimeStorageRoot | Where-Object {
    $_.FullName -ne $KeepDirectory -and
    -not (Test-RunLockHeld (Get-WorkspaceRunDirectory $_.FullName))
  })

  foreach ($directory in $stale) {
    try {
      Assert-ManagedDirectory -Directory $directory.FullName -Kind "runtime" -AllowOtherIdentity
    } catch {
      Write-Warning $_.Exception.Message
      continue
    }
    Write-Host "Reclaiming space from the idle test runtime $($directory.FullName)."
    Remove-Item $directory.FullName -Recurse -Force
  }
}

$identity = (& node (Join-Path $PSScriptRoot "test-workspace.mjs") identity $source | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
  throw "Cannot derive the isolated test workspace identity for $source."
}
$workspaceRun = Join-Path $workspaceRoot $identity.workspaceKey
$workspace = Join-Path $workspaceRun "workspace"
$lockFile = Join-Path $workspaceRun $lockName
$mountedRuntimeDrive = $null
$lockHandle = $null

Initialize-ManagedDirectory -Directory $workspaceRun -Kind "workspace-run"
try {
  $lockHandle = [IO.File]::Open(
    $lockFile,
    [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite,
    [IO.FileShare]::Delete
  )
} catch [IO.IOException] {
  throw "Another test run is already using $workspaceRun. Wait for it to finish."
}
$lockRecord = (
  [pscustomobject]@{
    ProcessId = $PID
    StartTicks = (Get-Process -Id $PID).StartTime.Ticks
    WorkspaceKey = $identity.workspaceKey
  } | ConvertTo-Json -Compress
)
$lockHandle.SetLength(0)
$lockBytes = [Text.Encoding]::UTF8.GetBytes($lockRecord)
$lockHandle.Write($lockBytes, 0, $lockBytes.Length)
$lockHandle.Flush()

try {
  $driveStatus = Get-TestRamDiskStatus `
    -DriveInfo (Get-TestRamDiskInfo) `
    -MinimumAvailableFreeSpace $requiredRuntimeFreeSpace
  if ($driveStatus -eq "Ready") {
    $runtimeStorageRoot = $ramDiskRuntimeRoot
  } else {
    $runtimeStorageRoot = $diskRuntimeRoot
    Write-Host "T: RAM runtime unavailable ($driveStatus); using isolated disk storage $runtimeStorageRoot."
  }

  $runtimeStorageRun = Join-Path $runtimeStorageRoot $identity.workspaceKey
  Remove-StaleRuntimeDirectories -KeepDirectory $runtimeStorageRun

  if (Test-Path $runtimeStorageRun) {
    Assert-ManagedDirectory -Directory $runtimeStorageRun -Kind "runtime"
    Remove-Item $runtimeStorageRun -Recurse -Force
  }
  Initialize-ManagedDirectory -Directory $runtimeStorageRun -Kind "runtime"
  if ($driveStatus -eq "Ready") {
    $runtimeRun = $runtimeStorageRun
  } else {
    $mountedRuntimeDrive = Mount-TestRuntime $runtimeStorageRun
    $runtimeRun = "$mountedRuntimeDrive\"
  }
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

  Set-Content -Path (Join-Path $homeDirectory ".gitconfig") -Value @"
[user]
	name = Context Launch Tests
	email = tests@context-launch.invalid
[core]
	longpaths = true
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
  $env:CONTEXT_LAUNCH_TEST_WORKSPACE = $workspace
  $activeTokenBytes = New-Object byte[] 32
  $randomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $randomNumberGenerator.GetBytes($activeTokenBytes)
  } finally {
    $randomNumberGenerator.Dispose()
  }
  $activeToken = -join ($activeTokenBytes | ForEach-Object { $_.ToString("x2") })
  $activeMarker = [ordered]@{
    managedBy = "context-launch-test-runner"
    version = 1
    kind = "active-workspace"
    directory = [IO.Path]::GetFullPath($workspace).TrimEnd("\")
    workspaceKey = $identity.workspaceKey
    sourcePath = $identity.sourcePath
    sourceRef = $identity.sourceRef
    active = $true
    token = $activeToken
  }
  Set-Content -Path (Join-Path $workspace $activeMarkerName) -Value ($activeMarker | ConvertTo-Json -Compress) -NoNewline
  $env:CONTEXT_LAUNCH_TEST_TOKEN = $activeToken

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
  try {
    if ($mountedRuntimeDrive) {
      & subst.exe $mountedRuntimeDrive /D
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to remove the test runtime mapping $mountedRuntimeDrive."
      }
    }
  } finally {
    if ($lockHandle) {
      Remove-Item $lockFile -Force
	  $lockHandle.Dispose()
	  $lockHandle = $null
    }
  }
}

exit $suiteExitCode
