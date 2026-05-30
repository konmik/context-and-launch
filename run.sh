#!/usr/bin/env bash
# run.sh -- Start Context & Launch server and open in browser app mode
set -euo pipefail

die() {
    echo "ERROR: $*" >&2
    read -r -p "Press Enter to exit" _ || true
    exit 1
}

command -v node >/dev/null 2>&1 || die "Node.js is not installed or not in PATH."

node_version=$(node --version)
major=${node_version#v}
major=${major%%.*}
if [ "$major" -lt 20 ]; then
    die "Node.js >= 20 required (found $node_version)."
fi

config_path="$HOME/.context-launch/config.json"
port=14780
browser="chrome"

if [ -f "$config_path" ]; then
    if parsed=$(node -e '
        const fs = require("fs");
        try {
            const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            process.stdout.write((c.port || "") + "\n" + (c.browser || ""));
        } catch (e) { process.exit(2); }
    ' "$config_path" 2>/dev/null); then
        cfg_port=$(printf '%s\n' "$parsed" | sed -n '1p')
        cfg_browser=$(printf '%s\n' "$parsed" | sed -n '2p')
        [ -n "$cfg_port" ] && port="$cfg_port"
        [ -n "$cfg_browser" ] && browser="$cfg_browser"
    else
        echo "WARNING: Could not parse config.json, using defaults."
    fi
fi

url="http://localhost:$port"

port_in_use() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    elif command -v nc >/dev/null 2>&1; then
        nc -z localhost "$1" >/dev/null 2>&1
    else
        node -e '
            const net = require("net");
            const s = net.createConnection({ host: "127.0.0.1", port: Number(process.argv[1]) });
            s.on("connect", () => { s.end(); process.exit(0); });
            s.on("error", () => process.exit(1));
        ' "$1" >/dev/null 2>&1
    fi
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Returns 0 (true) if .output is missing or older than any tracked source path.
# Tracked sources: src/, app.config.ts, package.json, package-lock.json.
output_is_stale() {
    local marker=".output/server/index.mjs"
    [ -f "$marker" ] || return 0
    local newer
    newer=$(find src public app.config.ts package.json package-lock.json -newer "$marker" -print -quit 2>/dev/null || true)
    [ -n "$newer" ]
}

if ! port_in_use "$port"; then
    cd "$script_dir"

    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install || die "npm install failed."
    fi

    build_reason=""
    if [ ! -d ".output" ]; then
        build_reason="missing"
    elif output_is_stale; then
        build_reason="stale"
    fi

    if [ -n "$build_reason" ]; then
        if [ "$build_reason" = "stale" ]; then
            echo "Source files are newer than .output, rebuilding..."
        else
            echo "Building application..."
        fi
        if [ "${RUN_SH_DRY_RUN:-}" = "1" ]; then
            echo "DRY_RUN: BUILD=yes REASON=$build_reason"
            exit 0
        fi
        npx vinxi build || die "Build failed."
    elif [ "${RUN_SH_DRY_RUN:-}" = "1" ]; then
        echo "DRY_RUN: BUILD=no"
        exit 0
    fi

    echo "Starting server on port $port..."
    PORT="$port" nohup node .output/server/index.mjs >/dev/null 2>&1 &
    disown || true

    attempts=0
    max_attempts=30
    while [ "$attempts" -lt "$max_attempts" ]; do
        sleep 0.5
        if port_in_use "$port"; then
            break
        fi
        attempts=$((attempts + 1))
    done

    if [ "$attempts" -ge "$max_attempts" ]; then
        die "Server did not start within 15 seconds."
    fi
fi

echo "Opening browser..."

open_browser_app() {
    local name=$1
    local app_url=$2

    if [ -x "$name" ]; then
        "$name" --app="$app_url" >/dev/null 2>&1 &
        disown || true
        return 0
    fi

    case "$(uname -s)" in
        Darwin)
            local app_path=""
            case "$name" in
                chrome|google-chrome)
                    app_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                    ;;
                msedge|edge|microsoft-edge)
                    app_path="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
                    ;;
                chromium)
                    app_path="/Applications/Chromium.app/Contents/MacOS/Chromium"
                    ;;
                brave)
                    app_path="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
                    ;;
            esac
            if [ -n "$app_path" ] && [ -x "$app_path" ]; then
                "$app_path" --app="$app_url" >/dev/null 2>&1 &
                disown || true
                return 0
            fi
            ;;
        *)
            local bin=""
            case "$name" in
                chrome|google-chrome) bin="google-chrome" ;;
                msedge|edge|microsoft-edge) bin="microsoft-edge" ;;
                chromium) bin="chromium" ;;
                brave) bin="brave-browser" ;;
            esac
            if [ -n "$bin" ] && command -v "$bin" >/dev/null 2>&1; then
                "$bin" --app="$app_url" >/dev/null 2>&1 &
                disown || true
                return 0
            fi
            ;;
    esac

    return 1
}

opened=0
if open_browser_app "$browser" "$url"; then
    opened=1
fi

if [ "$opened" -eq 0 ] && [ "$browser" != "msedge" ]; then
    if open_browser_app "msedge" "$url"; then
        opened=1
    fi
fi

if [ "$opened" -eq 0 ]; then
    case "$(uname -s)" in
        Darwin) open "$url" ;;
        *) xdg-open "$url" >/dev/null 2>&1 || die "No browser available to open $url" ;;
    esac
fi

echo "Context & Launch running at $url"
