param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("unit", "gate", "e2e", "all", "shell", "bench")]
  [string]$Suite
)

$ErrorActionPreference = "Stop"

$volume = Get-Volume -DriveLetter T -ErrorAction SilentlyContinue
if (-not $volume) {
  throw "The T: RAM disk does not exist. Run npm run test:ramdisk:create first."
}
if ($volume.FileSystemLabel.Trim() -ne "Temp" -or $volume.FileSystem -ne "NTFS") {
  throw "T: is not the Temp NTFS RAM disk."
}
if ($volume.SizeRemaining -lt 2GB) {
  throw "The T: RAM disk requires at least 2 GB of free space to run the test suite."
}

$source = Split-Path $PSScriptRoot -Parent
$ramRoot = "T:\context-launch-tests"
$workspace = Join-Path $ramRoot "workspace"
$runtime = Join-Path $ramRoot "runtime"
$marker = Join-Path $ramRoot ".managed-by-context-launch"

New-Item -ItemType Directory -Force $ramRoot | Out-Null
if (-not (Test-Path $marker)) {
  $existingEntries = Get-ChildItem $ramRoot -Force
  if ($existingEntries.Count -ne 0) {
    throw "$ramRoot contains data not created by this test runner. Move it before running tests."
  }
  Set-Content -Path $marker -Value "Context & Launch test RAM workspace"
}
New-Item -ItemType Directory -Force $workspace, $runtime | Out-Null

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
  throw "Failed to mirror the workspace to T:; robocopy exited with code $LASTEXITCODE."
}

$tempDirectory = Join-Path $runtime "temp"
$cacheDirectory = Join-Path $runtime "cache"
$dataDirectory = Join-Path $runtime "data"
$homeDirectory = Join-Path $runtime "home"
New-Item -ItemType Directory -Force $tempDirectory, $cacheDirectory, $dataDirectory, $homeDirectory | Out-Null

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
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
