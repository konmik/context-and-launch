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

function ConvertFrom-AgentInvocationJson {
    param([string]$Json)

    $invocation = ConvertFrom-Json $Json -ErrorAction Stop
    if ($null -eq $invocation -or $invocation -is [array]) {
        throw "CL_AGENT_INVOCATION_JSON must contain an invocation object"
    }

    $executableProperty = $invocation.PSObject.Properties['executable']
    if ($null -eq $executableProperty -or $executableProperty.Value -isnot [string] -or
        [string]::IsNullOrWhiteSpace($executableProperty.Value)) {
        throw "CL_AGENT_INVOCATION_JSON executable is missing"
    }

    $argumentsProperty = $invocation.PSObject.Properties['arguments']
    if ($null -eq $argumentsProperty -or $argumentsProperty.Value -isnot [array]) {
        throw "CL_AGENT_INVOCATION_JSON arguments must be an array"
    }

    $arguments = @($argumentsProperty.Value)
    if (@($arguments | Where-Object { $_ -isnot [string] }).Count -gt 0) {
        throw "CL_AGENT_INVOCATION_JSON arguments must be strings"
    }

    return [pscustomobject]@{
        Executable = [string]$executableProperty.Value
        Arguments = [string[]]$arguments
    }
}

if ($selfLaunch) {
    if (-not $env:CL_AGENT_MARKER) { throw "CL_AGENT_MARKER is not set" }
    if (-not $env:CL_AGENT_INVOCATION_JSON) { throw "CL_AGENT_INVOCATION_JSON is not set" }

    try {
        $invocation = ConvertFrom-AgentInvocationJson $env:CL_AGENT_INVOCATION_JSON
    } finally {
        Remove-Item Env:CL_AGENT_INVOCATION_JSON -ErrorAction SilentlyContinue
    }

    $executable = $invocation.Executable
    $commandArgs = @($invocation.Arguments)
    $m = $env:CL_AGENT_MARKER
    $d = Split-Path -Parent $m
    if ($d) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    $s = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Set-Content -LiteralPath $m -Value ("{""pid"":$PID,""startSec"":$s}")
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
$invocation = [ordered]@{
    executable = [string]$agentCommand[0]
    arguments = @($agentCommand[1..($agentCommand.Length - 1)])
}
$env:CL_AGENT_INVOCATION_JSON = ConvertTo-Json $invocation -Depth 3 -Compress
$scriptPath = $MyInvocation.MyCommand.Path

$safeTitle = ($windowTitle -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1'
Start-Process wt -ArgumentList "-d", "`"$PWD`"", "--title", "`"$safeTitle`"", "--suppressApplicationTitle", "--", "powershell", "-NoExit", "-File", "`"$scriptPath`"", "-selfLaunch"
