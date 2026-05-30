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

if ! command -v lsof >/dev/null 2>&1; then
    echo "ERROR: lsof is not installed." >&2
    exit 1
fi

pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)

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
