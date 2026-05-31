# Context & Launch - Agent Launch Script (Windows)
# This script is called by Context & Launch to launch a Claude coding agent.
# It receives three arguments:
#   -initialPrompt: the prompt text to send to the agent
#   -ticketTitle: used to set the terminal window title
#   -markerPath: the marker file path the app polls to detect this running agent
#
# You can edit this script to customize how the agent is launched.
# Context & Launch will not overwrite your changes.

param(
    [string]$initialPrompt,
    [string]$ticketTitle,
    [string]$markerPath
)

$windowTitle = $ticketTitle

# Record a marker the app reads to detect a running agent. The inner shell
# writes its own pid on start and deletes the marker when claude ends; it is
# passed via the environment to avoid quoting the path into the command string.
# A hard window close leaves the marker, but the app reaps it once the pid dies.
$env:CL_AGENT_MARKER = $markerPath
$inner = @'
if ($env:CL_AGENT_MARKER) {
    $m = $env:CL_AGENT_MARKER
    $d = Split-Path -Parent $m
    if ($d) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    Set-Content -LiteralPath $m -Value ("{""pid"":$PID}")
    try { claude --dangerously-skip-permissions } finally { Remove-Item -LiteralPath $m -ErrorAction SilentlyContinue }
} else {
    claude --dangerously-skip-permissions
}
'@

# Open a new Windows Terminal tab and run Claude under the marker-writing shell
Start-Process wt -ArgumentList "-d", "`"$PWD`"", "--title", "`"$windowTitle`"", "--suppressApplicationTitle", "--", "powershell", "-NoExit", "-Command", $inner

# Deliver the initial prompt via SendKeys
$escaped = $initialPrompt -replace '([+^%~(){}\[\]])', '{$1}'
$escaped = $escaped -replace "'", "''"

$maxRetries = 20
$retryCount = 0
$titleEscaped = $windowTitle -replace "'", "''"

while ($retryCount -lt $maxRetries) {
    Start-Sleep -Milliseconds 500
    $ws = New-Object -ComObject WScript.Shell
    if ($ws.AppActivate($titleEscaped)) {
        Start-Sleep -Seconds 1
        [void]$ws.AppActivate($titleEscaped)
        # Press Enter to accept the trust-project warning
        $ws.SendKeys("~")
        Start-Sleep -Seconds 2
        [void]$ws.AppActivate($titleEscaped)
        $ws.SendKeys($escaped + "~")
        break
    }
    $retryCount++
}

if ($retryCount -eq $maxRetries) {
    Write-Warning "Failed to send keys to window '$windowTitle' after $maxRetries retries"
}
