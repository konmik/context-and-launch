function Get-TestRamDiskInfo {
  try {
    $drive = [System.IO.DriveInfo]::new("T:\")
    if (-not $drive.IsReady) {
      return $null
    }

    return [pscustomobject]@{
      VolumeLabel = $drive.VolumeLabel
      DriveFormat = $drive.DriveFormat
      AvailableFreeSpace = $drive.AvailableFreeSpace
    }
  } catch [System.IO.IOException], [System.UnauthorizedAccessException], [System.Security.SecurityException] {
    return $null
  }
}

function Get-TestRamDiskStatus {
  param(
    [AllowNull()]
    [object]$DriveInfo,
    [long]$MinimumAvailableFreeSpace = 0
  )

  if ($null -eq $DriveInfo) {
    return "Missing"
  }
  if (([string]$DriveInfo.VolumeLabel).Trim() -ne "Temp" -or $DriveInfo.DriveFormat -ne "NTFS") {
    return "Invalid"
  }
  if ($DriveInfo.AvailableFreeSpace -lt $MinimumAvailableFreeSpace) {
    return "InsufficientSpace"
  }
  return "Ready"
}
