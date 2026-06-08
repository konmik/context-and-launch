## Problem Statement

Context & Launch runs as a Node.js server that opens a browser in app mode via run.ps1/run.sh. This works but produces a generic browser icon on the taskbar that cannot be pinned as a standalone application. The heartbeat mechanism that auto-shuts down the server after 5 minutes of browser inactivity is fragile and adds unnecessary complexity.

## Solution

Package the app as an Electron desktop application with a custom icon that can be pinned to the OS taskbar. Electron replaces the browser-in-app-mode approach with a native window, and its window lifecycle replaces the heartbeat shutdown mechanism.

## Implementation Decisions

### Architecture

- Electron acts as a thin shell wrapping the existing vinxi/SolidStart server. The server code, API routes, and frontend are unchanged.
- The Electron main process imports the built vinxi server entry point (.output/server/index.mjs) in-process. No child process spawning for the server.
- The embedded server listens on a random OS-assigned port (bind to port 0). The port is invisible to the user. BrowserWindow loads http://localhost:PORT.
- Dual mode: run.ps1/run.sh continue to work alongside Electron. npm run dev is unchanged. The Electron build is a separate workflow.

### Project structure

- Top-level electron/ directory contains Electron-specific code, separate from src/.
- electron/main.ts is the Electron entry point, compiled to electron/main.js with esbuild. Build command: esbuild electron/main.ts --bundle --platform=node --outfile=electron/main.js --external:electron.
- Build steps are separate commands: vinxi build, esbuild electron/main.ts, electron-builder. Not chained into a single script.
- Electron output goes to dist-electron/, separate from the vinxi .output/ directory.

### Packaging

- electron-builder produces portable executables only, no installer.
- All three platforms: Windows (.exe), macOS (.app), Linux (AppImage).
- App display name: "Context & Launch". Executable/package name: "context-launch".
- Icon: convert existing favicon.svg to platform-specific formats (.ico for Windows, .icns for macOS, .png for Linux).
- electron-builder bundles: electron/main.js, .output/ (the vinxi build), package.json.

### Window

- Native OS title bar.
- No menu bar (autoHideMenuBar: true).
- Default Electron window size, no overrides, no persistence of window position or dimensions.

### Security

- nodeIntegration: false, contextIsolation: true, webSecurity: true.
- The renderer is a plain browser loading localhost. It has no Node.js access and communicates with the server via HTTP fetch, same as today.

### Lifecycle

- Single instance lock via app.requestSingleInstanceLock(). Second launch focuses the existing window.
- Remove the heartbeat mechanism entirely: HeartbeatManager class, the WebSocket handler (ws.ts), the heartbeat client (heartbeat-client.ts), the WebSocket router in app.config.ts, and the heartbeat import in entry-client.tsx. The heartbeat exists solely for idle server shutdown, which Electron's window lifecycle replaces.
- On window-all-closed: wait for in-process git operations (ticket sync, file watcher auto-commits) to finish, then quit.
- If git operations take longer than 5 seconds, show a small "finishing sync..." window with a force-quit button.
- Detached Claude Code agents are independent processes with their own UI. Do not wait for them, do not kill them, do not notify the user about them.

### Heartbeat removal details

- The heartbeat is only used for idle shutdown. It has no other purpose.
- Files to remove or modify:
  - Delete: HeartbeatManager (src/server/infra/heartbeat.ts), WebSocket handler (src/server/infra/ws.ts), heartbeat client (src/lib/heartbeat-client.ts), and their tests.
  - Modify: app.config.ts (remove the ws router), entry-client.tsx (remove heartbeat-client import).
- The heartbeat removal must not break the standalone server mode (run.ps1/run.sh). In standalone mode without Electron, the server simply runs until the process is killed. The 5-minute auto-shutdown was a convenience, not a requirement.

### Server startup adapter

- A thin wrapper around the vinxi server entry point that starts it on a random port and returns the resolved port number.
- In Electron mode, the main process calls this wrapper, waits for the port, then creates the BrowserWindow.
- In standalone mode (run.ps1/run.sh), the existing behavior is preserved: the server starts on the configured port (default 14780) via PORT env var.

## Out of Scope

- Installer (MSI, DMG, deb) -- portable executables only.
- Tray icon, system notifications, auto-start on boot.
- Replacing native file dialog code with Electron's dialog API.
- Window size/position persistence.
- Custom frameless title bar.
- Changes to the dev workflow (npm run dev stays as-is).

## Further Notes

- Electron's built-in Node.js runtime is sufficient. No separate Node.js bundling needed.
- External tools (git, claude) must be on the user's PATH. The Electron app does not bundle them.
- The open-in-OS function (explorer.exe/open/xdg-open) uses detached spawn to work around run.ps1's hidden window. This is harmless in Electron and does not need changing.
