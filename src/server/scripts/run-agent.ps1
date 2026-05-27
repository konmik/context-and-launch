# Context & Launch - Agent Launch Script (Windows)
# This script is called by Context & Launch to launch a Claude coding agent.
# It receives two arguments:
#   -initialPrompt: the prompt text to send to the agent
#   -ticketTitle: used to set the terminal window title
#
# You can edit this script to customize how the agent is launched.
# Context & Launch will not overwrite your changes.

param(
    [string]$initialPrompt,
    [string]$ticketTitle
)

$windowTitle = $ticketTitle

# Open a new Windows Terminal tab and run Claude directly
Start-Process wt -ArgumentList "-d", "`"$PWD`"", "--title", "`"$windowTitle`"", "--suppressApplicationTitle", "--", "cmd", "/k", "claude --dangerously-skip-permissions"

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
