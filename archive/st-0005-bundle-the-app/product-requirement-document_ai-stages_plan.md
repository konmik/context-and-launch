# Implementation Plan: ST-0005 Bundle the App

Implements zip-based distribution for ai-stages on Windows. Adds two PowerShell scripts (run.ps1, kill-server.ps1), a WebSocket heartbeat system for server lifecycle management, and configuration support for port and browser preferences.

## Step 1: Add port and browser fields to config

Extend the project registry configuration to include top-level port and browser fields.

Files to modify:
- src/types.ts -- add port and browser to ProjectConfig
- src/server/project-registry.ts -- preserve port/browser during load/save, add getPort()/getBrowser() helpers

Acceptance criteria:
- Existing tests still pass
- Config with port/browser round-trips without data loss
- Default port is 14780 when not specified
- Default browser is "chrome" when not specified

## Step 2: Enable WebSocket support in app.config.ts

Files to modify:
- app.config.ts -- add experimental: { websocket: true } to the server object

Acceptance criteria:
- vinxi build succeeds
- vinxi dev still works

## Step 3: Create server-side heartbeat WebSocket handler

Files to create:
- src/server/heartbeat.ts -- HeartbeatManager singleton (connection tracking, 30s shutdown timer)
- src/routes/api/heartbeat.ts -- WebSocket route using defineWebSocket from vinxi/http

HeartbeatManager logic:
- Track active peer count
- On last peer disconnect: start 30-second timer
- On new peer connect: cancel pending timer
- When timer fires with 0 connections: process.exit(0)

Acceptance criteria:
- WebSocket connections to ws://localhost:PORT/api/heartbeat are accepted
- Last connection close starts 30s timer
- New connection within 30s cancels timer
- No reconnection within 30s causes process.exit(0)
- Multiple simultaneous connections tracked correctly

## Step 4: Create client-side heartbeat WebSocket connection

Files to create:
- src/lib/heartbeat-client.ts -- opens WS, sends pings every 10s, auto-reconnects

Files to modify:
- src/entry-client.tsx -- import heartbeat-client as side-effect

Acceptance criteria:
- Opening app establishes WS to /api/heartbeat
- Closing tab triggers server 30s timer
- Page refresh re-establishes WS within milliseconds
- Sleep/wake reconnects via visibilitychange

## Step 5: Create run.ps1

Files to create:
- run.ps1 at project root

Logic:
1. Check Node.js >= 20
2. Read ~/.ai-stages/config.json for port (default 14780) and browser (default "chrome")
3. Check if port is in use; if so, skip to opening browser
4. If no node_modules, run npm install
5. If no .output, run npx vinxi build
6. Start server via npx vinxi start as hidden process with PORT env var
7. Open browser in --app mode (try configured browser, fall back to other)

## Step 6: Create kill-server.ps1

Files to create:
- kill-server.ps1 at project root

Logic:
1. Read config for port (default 14780)
2. Find node.exe process on that port via Get-NetTCPConnection
3. Stop-Process -Force

## Step 7: Tests

Files to create:
- src/server/heartbeat.test.ts -- unit tests with vitest fake timers

Test cases:
- Timer starts when last peer disconnects
- Timer cancelled when new peer connects within 30s
- Multiple peers: timer only starts when count reaches 0
- process.exit called after 30s with no reconnection
- Rapid connect/disconnect does not leak timers

## Dependency Order

Group A (parallel): Steps 1, 2
Group B (after A, parallel): Steps 3, 5, 6
Group C (after 3): Steps 4, 7
Group D (after all): Final validation

## Validation Checks

1. vitest run -- all tests pass
2. vinxi build -- succeeds
3. Server starts on configured port
4. WebSocket heartbeat connects in browser
5. Server shuts down 30s after browser close
6. run.ps1 end-to-end flow works
7. kill-server.ps1 terminates server
8. Second run.ps1 invocation just opens browser
