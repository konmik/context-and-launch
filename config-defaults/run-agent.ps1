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
    if (-not $env:CL_AGENT_COMMAND_JSON) { throw "CL_AGENT_COMMAND_JSON is not set" }
    $m = $env:CL_AGENT_MARKER
    $d = Split-Path -Parent $m
    if ($d) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    $s = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Set-Content -LiteralPath $m -Value ("{""pid"":$PID,""startSec"":$s}")
    $executable, $commandArgs = @(ConvertFrom-Json $env:CL_AGENT_COMMAND_JSON)
    $commandArgs = @($commandArgs)
    Remove-Item Env:CL_AGENT_COMMAND_JSON
    try { & $executable @commandArgs } finally { Remove-Item -LiteralPath $m -ErrorAction SilentlyContinue }
    return
}

if ($args.Length -lt 4) {
    throw 'Usage: run-agent.ps1 <prompt> <title> <marker> <agent command...>'
}

$initialPrompt = $args[0]
$windowTitle = $args[1]
$markerPath = $args[2]
$agentCommand = @($args[3..($args.Length - 1)] | ForEach-Object { [string]$_ }) + @([string]$initialPrompt)

$env:CL_AGENT_MARKER = $markerPath
$env:CL_AGENT_COMMAND_JSON = ConvertTo-Json $agentCommand -Compress
$scriptPath = $MyInvocation.MyCommand.Path

$safeTitle = ($windowTitle -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1'
Start-Process wt -ArgumentList "-d", "`"$PWD`"", "--title", "`"$safeTitle`"", "--suppressApplicationTitle", "--", "powershell", "-NoExit", "-File", "`"$scriptPath`"", "-selfLaunch"
