#!/bin/bash
# Context & Launch - Agent Launch Script (macOS)
# This script is called by Context & Launch to launch a Claude coding agent.
# It receives three positional arguments:
#   $1: the prompt text to send to the agent
#   $2: the ticket title, used to set the terminal window title
#   $3: the marker file path the app polls to detect this running agent
#
# You can edit this script to customize how the agent is launched.
# Context & Launch will not overwrite your changes.
#
# Invocations:
#   "$0" <prompt> <title> <marker>  launcher entry. Stash args, open self in Terminal.
#   "$0"                            Terminal opened the script (no argv passes through). Re-exec with flag.
#   "$0" --self-launch              In Terminal. Read stashed args, run claude under expect.

if [ "$1" = "--self-launch" ]; then
  PROMPT="$(launchctl getenv CL_AGENT_PROMPT)"
  TITLE="$(launchctl getenv CL_AGENT_TITLE)"
  CWD="$(launchctl getenv CL_AGENT_CWD)"
  MARKER="$(launchctl getenv CL_AGENT_MARKER)"
  launchctl unsetenv CL_AGENT_PROMPT
  launchctl unsetenv CL_AGENT_TITLE
  launchctl unsetenv CL_AGENT_CWD
  launchctl unsetenv CL_AGENT_MARKER
  export CL_AGENT_PROMPT="$PROMPT"
  export CL_AGENT_TITLE="$TITLE"
  [ -n "$CWD" ] && [ -d "$CWD" ] && cd "$CWD"
  # Record a marker the app reads to detect a running agent. We store THIS
  # shell's pid (it stays alive as expect's parent for the whole session) plus
  # its start time, so a later pid reuse can't be mistaken for a live agent.
  # The trap removes it on exit, including when the user closes the window.
  if [ -n "$MARKER" ]; then
    mkdir -p "$(dirname "$MARKER")"
    START="$(ps -o lstart= -p $$ | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//')"
    printf '{"pid":%d,"start":"%s"}\n' "$$" "$START" > "$MARKER"
    trap 'rm -f "$MARKER"' EXIT HUP INT TERM
  fi
  # Terminal launches us under a login shell, which does NOT source ~/.zshrc /
  # ~/.bashrc. Many users put PATH additions (e.g. ~/.local/bin) only there, so
  # claude won't be found. Re-import PATH from an interactive shell.
  PATH="$("${SHELL:-/bin/zsh}" -ic 'printf %s "$PATH"' 2>/dev/null)" || true
  export PATH
  # Write title escapes directly to /dev/tty so they aren't lost to any stdout
  # buffering when we exec into expect.
  printf '\033]0;%s\007\033]2;%s\007' "$TITLE" "$TITLE" > /dev/tty 2>/dev/null || true
  # -c keeps expect's stdin connected to the real tty so `interact` can forward
  # the user's keystrokes to claude. Using a heredoc closes stdin and breaks
  # the user-to-claude direction.
  # `expect timeout {}` is used instead of `sleep N` so claude output streams
  # to the user in real time during the scripted-keystroke phase.
  # Not exec'd, so the EXIT trap above can remove the marker once claude ends.
  /usr/bin/expect -c '
set prompt $env(CL_AGENT_PROMPT)
set title  $env(CL_AGENT_TITLE)
spawn claude --dangerously-skip-permissions
send_user "\033]0;$title\007\033]2;$title\007"
set timeout 3
expect timeout {}
send "\r"
set timeout 4
expect timeout {}
send -- "\x1b\[200~$prompt\x1b\[201~"
set timeout 1
expect timeout {}
send "\r"
send_user "\033]0;$title\007\033]2;$title\007"
set timeout -1
interact
'
  exit 0
fi

if [ $# -ge 2 ]; then
  launchctl setenv CL_AGENT_PROMPT "$1"
  launchctl setenv CL_AGENT_TITLE  "$2"
  launchctl setenv CL_AGENT_MARKER "$3"
  launchctl setenv CL_AGENT_CWD    "$PWD"
  open -a Terminal "$0"
  exit 0
fi

exec "$0" --self-launch
