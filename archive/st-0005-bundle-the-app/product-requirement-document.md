# ST-0005: Bundle the App

## Goal

Distribute ai-stages as a single zip file that a Windows user can extract, double-click a script, and start using immediately in a browser window — no terminal windows, no manual build steps after first launch, no native wrapper.

## Target platform

Windows only. macOS and Linux are out of scope.

## Distribution format

A zip file containing the entire project folder (master branch) plus two scripts at the root:

- `run.ps1` — starts the app
- `kill-server.ps1` — force-stops the server process

No bundled Node.js runtime. No installer. No tray icon. No Electron/Tauri wrapper.

## run.ps1 behavior

On each launch, the script performs the following steps in order:

1. Check that Node.js >= 20 is installed. If not, print a message asking the user to install it and exit.
2. Check if the configured port is already in use. If so, skip to step 6 (open the browser).
3. If `node_modules` does not exist, run `npm install`.
4. If `.output` does not exist, run `vinxi build`.
5. Start the server via `vinxi start` in a hidden process (no console window visible, no taskbar entry).
6. Open the browser in app mode: try Chrome first (`chrome --app=http://localhost:PORT`), fall back to Edge (`msedge --app=http://localhost:PORT`). The browser preference is configurable.

## kill-server.ps1 behavior

Find the Node.js process listening on the configured port and terminate it.

## Server lifecycle

The server runs as a hidden background process. Its lifecycle is tied to the browser connection:

- The browser maintains a WebSocket heartbeat to the server.
- When the WebSocket connection drops (browser tab closed, browser closed, browser crashed), the server starts a 30-second grace timer.
- If the browser reconnects within 30 seconds (page refresh, wake from sleep), the timer resets and the server continues.
- If no reconnection occurs within 30 seconds, the server shuts itself down.
- On computer sleep/wake, the browser auto-reconnects the WebSocket. The 30-second window is long enough to cover the reconnection delay.

## Configuration

Two new fields in `~/.ai-stages/config.json` (the existing project registry file):

- `port` — the port the server listens on. Default: a fixed high port unlikely to collide with common dev tools (e.g. 14780).
- `browser` — path or command for the preferred browser. Default: `"chrome"`. Falls back to `"msedge"` if Chrome is not found.

## Out of scope

- macOS and Linux support
- Bundling Node.js in the zip
- Auto-update mechanism
- System tray icon
- Native window wrapper (Electron, Tauri)
- Installer (exe, msi)
