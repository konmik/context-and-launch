# Context & Launch - Agent Launch Script (Windows)
# This script is called by Context & Launch to launch a Claude coding agent.
# It receives three positional arguments followed by the agent command:
#   $args[0]: the prompt text to send to the agent
#   $args[1]: the terminal window title
#   $args[2]: the marker file path the app polls to detect this running agent
#   $args[3..]: the CLI command to run (e.g. claude --dangerously-skip-permissions)
#
# You can edit this script to customize how the agent is launched.
# Context & Launch will not overwrite your changes.
#
# Invocations:
#   powershell -File "$0" <prompt> <title> <marker> <cmd..>   launcher entry
#   powershell -File "$0" -selfLaunch                         inside WT tab

param(
    [switch]$selfLaunch
)

if ($selfLaunch) {
    if (-not $env:CL_AGENT_MARKER) { throw "CL_AGENT_MARKER is not set" }
    if (-not $env:CL_AGENT_CMD) { throw "CL_AGENT_CMD is not set" }
    $m = $env:CL_AGENT_MARKER
    $d = Split-Path -Parent $m
    if ($d) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    $s = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Set-Content -LiteralPath $m -Value ("{""pid"":$PID,""startSec"":$s}")
    try { Invoke-Expression $env:CL_AGENT_CMD } finally { Remove-Item -LiteralPath $m -ErrorAction SilentlyContinue }
    return
}

$initialPrompt = $args[0]
$windowTitle = $args[1]
$markerPath = $args[2]
$agentCmd = ($args[3..($args.Length - 1)]) -join ' '

$env:CL_AGENT_MARKER = $markerPath
$env:CL_AGENT_CMD = $agentCmd
$scriptPath = $MyInvocation.MyCommand.Path

Start-Process wt -ArgumentList "-d", "`"$PWD`"", "--title", "`"$windowTitle`"", "--suppressApplicationTitle", "--", "powershell", "-NoExit", "-File", "`"$scriptPath`"", "-selfLaunch"

# Deliver the initial prompt via SendKeys, splitting on <<ENTER>> markers
$tokens = $initialPrompt -split '(<<ENTER>>)' | Where-Object { $_.Length -gt 0 }
$maxRetries = 20
$retryCount = 0
$titleEscaped = $windowTitle -replace "'", "''"

$ws = New-Object -ComObject WScript.Shell
while ($retryCount -lt $maxRetries) {
    Start-Sleep -Milliseconds 500
    if ($ws.AppActivate($titleEscaped)) { break }
    $retryCount++
}
if ($retryCount -eq $maxRetries) { return }

Start-Sleep -Seconds 1
foreach ($token in $tokens) {
    [void]$ws.AppActivate($titleEscaped)
    Start-Sleep -Milliseconds 200
    if ($token -eq '<<ENTER>>') {
        $ws.SendKeys("{ENTER}")
        Start-Sleep -Seconds 2
    } else {
        $escaped = $token -replace '([+^%~(){}\[\]])', '{$1}'
        $ws.SendKeys($escaped)
        Start-Sleep -Milliseconds 300
    }
}
