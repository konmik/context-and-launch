## Implementation Plan: Electron App (ST-0021)

### Overview

This plan converts Context & Launch from a browser-in-app-mode approach to an Electron desktop application. It has three major workstreams:

1. Remove the heartbeat mechanism (no longer needed with Electron window lifecycle)
2. Create a server startup adapter for Electron's random-port mode
3. Build the Electron shell (main process, packaging, icons)

The workstreams are ordered so each step compiles, tests pass, and the existing dev/standalone workflows remain intact.

---

### Step 1: Remove the heartbeat mechanism

Rationale: The heartbeat exists solely for idle server shutdown. Electron replaces this with window lifecycle. Removing it first simplifies the build and eliminates the websocket router from app.config.ts before the Electron work begins. This change must not break standalone mode -- the server simply runs until killed.

Files to delete:
- src/server/infra/heartbeat.ts
- src/server/infra/heartbeat.test.ts
- src/server/infra/ws.ts
- src/lib/heartbeat-client.ts
- spec/heartbeat.md

Files to modify:

1. app.config.ts -- Remove the .addRouter(...) call that registers the /api/heartbeat websocket route, and the experimental: { websocket: true } from the server config since no other code uses websockets.

2. src/entry-client.tsx -- Remove the import "./lib/heartbeat-client.js"; line.

Acceptance criteria:
- tsc --noEmit passes with no heartbeat-related errors.
- npm run test passes (no broken imports, no failing unit tests).
- npm run test:e2e passes (no test relied on the websocket endpoint).
- npm run dev still works and serves the app.
- The standalone server (run.ps1/run.sh) still works: it starts, serves pages, and runs until killed. It no longer auto-shuts down after 5 minutes (which is the intended behavior change).

Edge cases:
- Verify no other file in src/ imports from heartbeat.ts, ws.ts, or heartbeat-client.ts.
- The autoCommit function in src/server/infra/git.ts is unrelated to heartbeat and must remain untouched.

---

### Step 2: Create the server startup adapter

Rationale: The Electron main process needs to start the vinxi server on a random OS-assigned port and learn the resolved port. In standalone mode, the existing behavior (PORT env var, default 14780) is preserved.

Files to create:

1. electron/server-adapter.ts -- A thin wrapper that reserves a random port and starts the vinxi server on it.

   Implementation approach (port reservation):
   - Use net.createServer to listen on port 0, get the assigned port, close the temp server.
   - Set process.env.PORT to the reserved port and process.env.HOST to 127.0.0.1.
   - Dynamically import the built vinxi server entry point (.output/server/index.mjs).
   - Return { port, shutdown }.

   The shutdown function calls fileWatcher.stopAll() to cancel debounce timers.

Acceptance criteria:
- The adapter compiles with esbuild.
- The standalone mode (run.ps1/run.sh) is unaffected.
- npm run dev is unaffected.

Edge cases:
- The .output/ directory must exist before the adapter runs. Build ordering ensures this.
- HOST must be set to 127.0.0.1 so BrowserWindow loads from the right address.
- Small race window between closing temp server and vinxi binding is acceptable on localhost.

---

### Step 3: Create the Electron main process

Files to create:

1. electron/main.ts -- The Electron entry point.

   Structure:
   - Single instance lock via app.requestSingleInstanceLock()
   - App ready handler: start server, create BrowserWindow, load http://localhost:{port}
   - Window-all-closed handler: graceful shutdown (stop FileWatcher, wait for git ops, then quit)
   - Second-instance handler: focus existing window

   Window config:
   - autoHideMenuBar: true
   - Native OS title bar
   - Default size, no persistence
   - nodeIntegration: false, contextIsolation: true, webSecurity: true
   - Icon from build-resources/icon.png

   Graceful shutdown:
   - Call shutdown() from server adapter (stops FileWatcher timers)
   - Wait up to 5 seconds for in-flight operations
   - If operations take longer, show a small "finishing sync..." window with force-quit button
   - Use data URI for the sync window HTML (no server route needed)
   - Detached Claude Code agents are independent processes -- do not wait for them

   Second instance: focus existing window, restore if minimized.

   macOS: quit on window-all-closed (overrides macOS convention per PRD).

Acceptance criteria:
- electron/main.ts compiles with esbuild to electron/main.js
- Running npx electron electron/main.js launches the app in a native window
- Closing the window exits the process cleanly
- Second instance focuses the first window
- No menu bar visible
- nodeIntegration is false, contextIsolation is true

---

### Step 4: Add dependencies and build scripts

Files to modify:

1. package.json -- Add devDependencies:
   - electron (latest stable)
   - electron-builder (latest stable)
   - esbuild (latest stable, if not already present)

   Add scripts:
   - "electron:build-main": esbuild electron/main.ts --bundle --platform=node --outfile=electron/main.js --external:electron
   - "electron:start": electron electron/main.js
   - "electron:dist": electron-builder

2. tsconfig.json -- Add "electron" to include array.

3. .gitignore -- Add dist-electron/ and electron/main.js.

4. eslint.config.js -- Add electron/**/*.ts to files, dist-electron/** to ignores.

Acceptance criteria:
- npm install succeeds
- esbuild produces electron/main.js
- tsc --noEmit includes electron/ and passes
- electron/main.js is gitignored

---

### Step 5: Create app icons

Convert existing public/favicon.svg to platform-specific formats.

Files to create:
- build-resources/icon.png (512x512 or 1024x1024)
- build-resources/icon.ico (Windows)
- build-resources/icon.icns (macOS)

Icon generation is a one-time task. Generated files are committed.

---

### Step 6: Configure electron-builder

Files to create:

1. electron-builder.yml -- Configuration for portable executables.

   Key settings:
   - appId: com.context-launch.app
   - productName: "Context & Launch"
   - directories.output: dist-electron
   - files: electron/main.js, .output/**/*, package.json
   - extraMetadata.main: electron/main.js
   - Portable executables only (no installers)
   - Platform-specific icon paths

Acceptance criteria:
- electron-builder produces output in dist-electron/
- The executable runs and shows the app
- The executable has the custom icon

---

### Step 7: Expose shutdown hook for graceful quit

The server adapter returns a shutdown() function that the Electron main process calls on window-all-closed.

Approach:
- After importing the server entry, access globalThis for the service container.
- shutdown() calls fileWatcher.stopAll() to cancel debounce timers.
- On window-all-closed, call shutdown(), wait briefly, then app.quit().

Acceptance criteria:
- Closing the window stops the FileWatcher
- App exits cleanly within a few seconds
- No orphaned processes

---

### Step 8: Verify existing tests

- No e2e tests reference the heartbeat websocket endpoint.
- No unit tests import from deleted files.
- Deleted test files simply stop being included.
- npm run test:all passes after all changes.

---

### Step 9: Write Electron-specific unit test

Files to create:

1. electron/server-adapter.test.ts -- Unit test for port reservation logic.
   - Returns a valid port number (> 0, < 65536)
   - Two calls return different ports

Files to modify:

1. vitest.config.ts -- Add electron test files to unit-ts project include.

Acceptance criteria:
- vitest run electron/server-adapter.test.ts passes
- npm run test includes and passes the new test

---

### Dependency Graph (execution order)

Step 1 (heartbeat removal) -> Step 2 (server adapter) + Step 5 (icons) in parallel -> Step 4 (deps & scripts) -> Step 3 (electron main) -> Step 6 (electron-builder config) -> Step 7 (shutdown hook) -> Step 8 (verify tests) -> Step 9 (new tests)

---

### Full file inventory

Files to delete (5):
- src/server/infra/heartbeat.ts
- src/server/infra/heartbeat.test.ts
- src/server/infra/ws.ts
- src/lib/heartbeat-client.ts
- spec/heartbeat.md

Files to create (7):
- electron/main.ts
- electron/server-adapter.ts
- electron/server-adapter.test.ts
- build-resources/icon.png
- build-resources/icon.ico
- build-resources/icon.icns
- electron-builder.yml

Files to modify (7):
- app.config.ts
- src/entry-client.tsx
- package.json
- tsconfig.json
- .gitignore
- eslint.config.js
- vitest.config.ts

---

### Validation checklist (run after all steps)

1. tsc --noEmit -- No type errors.
2. eslint . -- No lint errors.
3. vitest run --exclude 'e2e/**' -- All unit tests pass.
4. vinxi build -- Vinxi build succeeds.
5. esbuild electron/main.ts -- Esbuild succeeds.
6. vitest run e2e/ -- All e2e tests pass (standalone server mode works).
7. npx electron electron/main.js -- App launches in native window.
8. Second instance focusing works.
9. Closing window exits the process cleanly.
10. electron-builder produces portable executable.
