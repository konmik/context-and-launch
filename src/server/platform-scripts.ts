// Platform-specific agent launch scripts.
// These are written to ~/.ai-stages/ on first config load and are user-editable.

export const RUN_AGENT_PS1 = `# AI Stages - Agent Launch Script (Windows)
# This script is called by AI Stages to launch a Claude coding agent.
# It receives two arguments:
#   -initialPrompt: the prompt text to send to the agent
#   -ticketTitle: used to set the terminal window title
#
# You can edit this script to customize how the agent is launched.
# AI Stages will not overwrite your changes.

param(
    [string]$initialPrompt,
    [string]$ticketTitle
)

$windowTitle = $ticketTitle

# Open a new Windows Terminal tab with the given title and run Claude
$batPath = Join-Path $env:TEMP "claude-run-$(Get-Date -Format 'yyyyMMddHHmmssfff').bat"
@"
@echo off
title $windowTitle
claude --dangerously-skip-permissions
del "%~f0"
"@ | Set-Content -Path $batPath -Encoding ASCII

Start-Process wt -ArgumentList "-d", "\`"$PWD\`"", "--title", "\`"$windowTitle\`"", "--suppressApplicationTitle", "--", $batPath

# Deliver the initial prompt via SendKeys
$escaped = $initialPrompt -replace '([+^%~(){}\\[\\]])', '{$1}'
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
        $ws.SendKeys($escaped + "~")
        break
    }
    $retryCount++
}

if ($retryCount -eq $maxRetries) {
    Write-Warning "Failed to send keys to window '$windowTitle' after $maxRetries retries"
}
`;

export const RUN_AGENT_SH = `#!/bin/bash
# AI Stages - Agent Launch Script (macOS)
# This script is called by AI Stages to launch a Claude coding agent.
# It receives two positional arguments:
#   $1: the prompt text to send to the agent
#   $2: the ticket title, used to set the terminal window title
#
# You can edit this script to customize how the agent is launched.
# AI Stages will not overwrite your changes.

INITIAL_PROMPT="\$1"
TICKET_TITLE="\$2"
WINDOW_TITLE="\${TICKET_TITLE}"

# Set the terminal title via ANSI escape sequence
printf '\\033]0;%s\\007' "\$WINDOW_TITLE"

# Launch Claude in the background
claude --dangerously-skip-permissions &
CLAUDE_PID=\$!

# Wait briefly for the terminal to become ready
sleep 2

# Deliver the initial prompt via AppleScript with System Events
osascript -e "
tell application \\"System Events\\"
    set frontProcess to first process whose frontmost is true
    tell frontProcess
        keystroke \\"\${INITIAL_PROMPT}\\"
        keystroke return
    end tell
end tell
" 2>/dev/null || echo "Warning: Failed to deliver initial prompt via AppleScript"

# Wait for Claude to finish
wait \$CLAUDE_PID
`;
