#!/usr/bin/env bash
# kill-server.sh -- Kill the Context & Launch server process
set -euo pipefail

config_path="$HOME/.context-launch/config.json"
port=14780

if [ -f "$config_path" ]; then
    if cfg_port=$(node -e '
        const fs = require("fs");
        try {
            const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            if (c.port) process.stdout.write(String(c.port));
        } catch (e) { process.exit(1); }
    ' "$config_path" 2>/dev/null) && [ -n "$cfg_port" ]; then
        port="$cfg_port"
    else
        echo "WARNING: Could not parse config.json, using default port."
    fi
fi

# Discover PIDs listening on $port using whichever tool is available.
# macOS only ships with lsof; common Linux distros have fuser or ss.
# If none are available we cannot identify the process, but absence of a
# port-inspection tool is not itself an error -- the server is probably
# not running at all on such a minimal host.
pids=""
if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)
elif command -v ss >/dev/null 2>&1; then
    pids=$(ss -H -ltnp "sport = :$port" 2>/dev/null \
        | grep -oE 'pid=[0-9]+' \
        | cut -d= -f2 \
        | sort -u || true)
else
    echo "WARNING: none of lsof, fuser, ss are installed; cannot inspect port $port."
    echo "No process listening on port $port (assumed)."
    exit 0
fi

if [ -z "$pids" ]; then
    echo "No process listening on port $port."
    exit 0
fi

found=0
for pid in $pids; do
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)
    case "$cmd" in
        *node*)
            if kill "$pid" 2>/dev/null; then
                echo "Stopped node process (PID $pid) on port $port."
                found=1
            fi
            ;;
    esac
done

if [ "$found" -eq 0 ]; then
    echo "No node process found listening on port $port."
fi
