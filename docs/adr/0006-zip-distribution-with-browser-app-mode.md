# Zip distribution with browser app mode

Distribute the app as a zip of the source repo with a PowerShell launch script. The server runs as a hidden background process and opens the user's browser in app mode (`--app` flag). No native wrapper, no bundled runtime, no installer.

## Context

The app needs to be downloadable and runnable in one step on Windows. The current development setup requires cloning the repo, installing dependencies, and running `vinxi dev` from a terminal. The app is a SolidStart/Node.js localhost server that the user interacts with through a browser.

## Decision

Ship a zip containing the project source, a `run.ps1` script, and a `kill-server.ps1` script. The launch script checks for Node.js >= 20, runs `npm install` and `vinxi build` on first launch, starts the server as a hidden process, and opens Chrome (or Edge) in `--app` mode. The server auto-exits via a WebSocket heartbeat when the browser disconnects for more than 30 seconds.

## Considered alternatives

- Electron. Rejected: 150MB+ bundle to wrap a localhost server that already works in the browser. Adds Chromium as a build dependency. The app mode flag gives the same clean-window appearance without the overhead.

- Tauri. Rejected: Tauri's backend is Rust, not Node.js. The entire server-side codebase (git operations, file watching, SolidStart server functions) uses Node.js APIs. Would require either rewriting the backend in Rust or shipping Node.js as a Tauri sidecar, making Tauri an expensive webview wrapper around a Node.js process.

- NW.js. Rejected: same tradeoff as Electron (bundles Chromium + Node.js) with a smaller community and less tooling. No meaningful advantage for this use case.

- Gluon. Rejected: uses the installed browser like our approach, but it is a young project with a small community. The launch script achieves the same result without a framework dependency.

- System tray icon for lifecycle management. Rejected: adds a dependency for tray integration when the WebSocket heartbeat achieves the same auto-shutdown behavior. The browser window is the app; closing it stops the server. A `kill-server.ps1` script covers the manual-kill case.

- Bundling Node.js in the zip. Rejected: adds 30-40MB to the download for a dev tool whose users are likely to have Node.js installed. The launch script checks the version and gives a clear error if missing.

- Native installer (exe/msi). Rejected: adds build complexity (signing, registry entries, uninstaller) for a tool that works as a simple unzip-and-run.
