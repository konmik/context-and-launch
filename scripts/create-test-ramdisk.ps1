$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ramdisk-drive.ps1")

$existingDrive = Get-TestRamDiskInfo
if ($existingDrive) {
  if ((Get-TestRamDiskStatus -DriveInfo $existingDrive) -ne "Ready") {
    throw "T: is already in use and is not the Temp NTFS RAM disk."
  }
  exit 0
}

$aim = "C:\Program Files\AIM Toolkit\aim_ll.exe"
if (-not (Test-Path $aim)) {
  throw "AIM Toolkit is not installed at $aim."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $process = Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  ) -Verb RunAs -Wait -PassThru
  exit $process.ExitCode
}

$freeMemoryBytes = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1KB
if ($freeMemoryBytes -lt 5GB) {
  throw "At least 5 GB of free physical memory is required to create the 4 GB test RAM disk."
}

& $aim -a -t file -o awe -s 4G -m T: -p "/fs:ntfs /q /y /v:Temp"
if ($LASTEXITCODE -ne 0) {
  throw "AIM Toolkit failed to create T: with exit code $LASTEXITCODE."
}

$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
  $drive = Get-TestRamDiskInfo
  if ((Get-TestRamDiskStatus -DriveInfo $drive) -eq "Ready") {
    exit 0
  }
  Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)

throw "T: was created but did not become ready within 20 seconds."
