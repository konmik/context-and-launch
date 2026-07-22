---
status: accepted
---

# Render client-only, keep the server for RPC

The app runs with `ssr: false` in [`app.config.ts`](../../app.config.ts): routes render only on the client. The `node-server` preset is retained so the embedded server the Electron main process boots ([`electron/server-adapter.ts`](../../electron/server-adapter.ts)) keeps hosting the `"use server"` RPC endpoints that back all git and filesystem work.

SSR earns nothing in an Electron host: there is no SEO, no network latency to hide behind a first paint, and JavaScript is always present. Disabling it removes the hydration pass and the isomorphic constraints it imposed, so route components never execute server-side. The renderer stays sandboxed (`nodeIntegration: false`, `contextIsolation: true`) and reaches privileged logic only through server functions, unchanged.

`server.static: true` is rejected: it produces static assets with no live server and would break server functions. The distinction is load-bearing — client-only rendering is the goal, a static build is not.
