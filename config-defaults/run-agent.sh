#!/bin/bash
# Context & Launch - Agent Launch Script (macOS)
# This script is called by Context & Launch to launch a Claude coding agent.
# It receives three positional arguments followed by the agent command:
#   $1: the prompt text to send to the agent
#   $2: the terminal window title
#   $3: the marker file path the app polls to detect this running agent
#   $4..: the CLI command to run (e.g. claude --dangerously-skip-permissions)
#
# You can edit this script to customize how the agent is launched.
# Context & Launch will not overwrite your changes.
#
# Invocations:
#   "$0" <prompt> <title> <marker> <cmd>  launcher entry. Stash args, open self in Terminal.
#   "$0"                            Terminal opened the script (no argv passes through). Re-exec with flag.
#   "$0" --self-launch              In Terminal. Read stashed args and run the agent.

if [ "$1" = "--self-launch" ]; then
  PROMPT="$(launchctl getenv CL_AGENT_PROMPT)"
  TITLE="$(launchctl getenv CL_AGENT_TITLE)"
  CWD="$(launchctl getenv CL_AGENT_CWD)"
  MARKER="$(launchctl getenv CL_AGENT_MARKER)"
  AGENT_CMD="$(launchctl getenv CL_AGENT_CMD)"
  launchctl unsetenv CL_AGENT_PROMPT
  launchctl unsetenv CL_AGENT_TITLE
  launchctl unsetenv CL_AGENT_CWD
  launchctl unsetenv CL_AGENT_MARKER
  launchctl unsetenv CL_AGENT_CMD
  [ -n "$CWD" ] && [ -d "$CWD" ] && cd "$CWD"
  [ -z "$MARKER" ] && { echo "CL_AGENT_MARKER is not set" >&2; exit 1; }
  [ -z "$AGENT_CMD" ] && { echo "CL_AGENT_CMD is not set" >&2; exit 1; }
  mkdir -p "$(dirname "$MARKER")"
  printf '{"pid":%d,"startSec":%d}\n' "$$" "$(date +%s)" > "$MARKER"
  trap 'rm -f "$MARKER"' EXIT HUP INT TERM
  # Terminal launches us under a login shell, which does NOT source ~/.zshrc /
  # ~/.bashrc. Many users put PATH additions (e.g. ~/.local/bin) only there, so
  # claude won't be found. Re-import PATH from an interactive shell.
  PATH="$("${SHELL:-/bin/zsh}" -ic 'printf %s "$PATH"' 2>/dev/null)" || true
  export PATH
  # Write title escapes directly to /dev/tty so they are not lost to buffering.
  printf '\033]0;%s\007\033]2;%s\007' "$TITLE" "$TITLE" > /dev/tty 2>/dev/null || true
  eval "$AGENT_CMD \"\$PROMPT\""
  exit $?
fi

if [ $# -ge 2 ]; then
  launchctl setenv CL_AGENT_PROMPT "$1"
  launchctl setenv CL_AGENT_TITLE  "$2"
  launchctl setenv CL_AGENT_MARKER "$3"
  shift 3
  launchctl setenv CL_AGENT_CMD    "$*"
  launchctl setenv CL_AGENT_CWD    "$PWD"
  open -a Terminal "$0"
  exit 0
fi

exec "$0" --self-launch
