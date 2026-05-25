#!/bin/bash
# AI Stages - Agent Launch Script (macOS)
# This script is called by AI Stages to launch a Claude coding agent.
# It receives two positional arguments:
#   $1: the prompt text to send to the agent
#   $2: the ticket title, used to set the terminal window title
#
# You can edit this script to customize how the agent is launched.
# AI Stages will not overwrite your changes.

INITIAL_PROMPT="$1"
TICKET_TITLE="$2"
WINDOW_TITLE="${TICKET_TITLE}"

# Set the terminal title via ANSI escape sequence
printf '\033]0;%s\007' "$WINDOW_TITLE"

# Launch Claude in the background
claude --dangerously-skip-permissions &
CLAUDE_PID=$!

# Wait briefly for the terminal to become ready
sleep 2

# Send Enter to accept the trust-project warning
osascript -e "
tell application \"System Events\"
    set frontProcess to first process whose frontmost is true
    tell frontProcess
        keystroke return
    end tell
end tell
" 2>/dev/null

sleep 2

# Deliver the initial prompt via AppleScript with System Events
osascript -e "
tell application \"System Events\"
    set frontProcess to first process whose frontmost is true
    tell frontProcess
        keystroke \"${INITIAL_PROMPT}\"
        keystroke return
    end tell
end tell
" 2>/dev/null || echo "Warning: Failed to deliver initial prompt via AppleScript"

# Wait for Claude to finish
wait $CLAUDE_PID
