# ST-0066: Solid 2 Migration

## Status

Planning document for implementation. Research and package metadata were checked on 2026-08-14.

## Summary

Migrate Context & Launch from Solid 1.9 and SolidStart 1/Vinxi to the current Solid 2 release-candidate architecture. The result must use Solid 2 idioms rather than compatibility aliases or Solid 1-shaped wrappers: the official Solid Vite plugin's Start client mode, Solid Router 2's explicit typed route tree, Solid 2 async computations and actions, split effects, renderer-owned JSX types, and web-standard request/response hosting.

The app is already configured as a client-rendered application (`ssr: false`) with a local server-function backend. Preserve that product architecture. Do not introduce SSR merely because the new tooling can provide it.

## Background

The current application uses:

- `solid-js@1.9.13`, `@solidjs/router@0.15.4`, `@solidjs/start@1.3.2`, `vinxi@0.5.11`, and `vite-plugin-solid@2.11.12`.
- SolidStart file routes for three UI routes and two API routes.
- 81 `"use server"` functions across ten feature API modules.
- Router `query`, `createAsync`, and `revalidate` for reads and invalidation.
- A custom `createNonSuspendingAsync` abstraction built around Solid 1 Suspense behavior.
- A Nitro-specific global publication plugin so Electron can call Nitro's `localFetch` in-process.
- 77 references to `createEffect`, plus Solid 1 lifecycle/cleanup patterns.
- Solid 1 DOM syntax and APIs including `classList`, `on:pointerdown`, context `.Provider`, `splitProps`, `Suspense`, and `ErrorBoundary`.
- Third-party Solid component packages compiled against removed Solid 1 APIs.

There are two separately versioned “2.0” efforts. SolidStart 2.0 is stable but deliberately remains on Solid 1 and declares Router `<2.0.0-0`; it is not the destination for a Solid core 2 migration. The Solid team now documents Start as a mode of `@solidjs/vite-plugin`, explicitly describing it as the serving layer that replaces SolidStart. That mode supports CSR, server functions, generated entries, Vite development/build/preview, and a web-standard production request handler.

## Goals

- Run the application on `solid-js@2.0.0-rc.0` and its matching web renderer.
- Remove SolidStart, Vinxi, Nitro, and their application-specific integration code.
- Preserve browser, Electron, API route, server-function, packaging, and test behavior.
- Adopt the current Solid 2 and Router 2 APIs throughout application code.
- Replace dependencies that execute Solid 1 runtime code with local Solid 2-native modules before the runtime cutover.
- Make browser and Electron hosting consume the same web-standard built-app handler.
- Leave no compatibility aliases for removed Solid 1 import paths or APIs.
- Keep the full quality gate green, including unit, shell, build, E2E, Electron packaging smoke coverage, lint, and type checking.

## Non-Goals

- Enabling server-side rendering.
- Changing visible product behavior, workflows, persisted data, URLs, or the custom Electron `app://context-launch` origin.
- Redesigning the UI.
- Adopting stable SolidStart 2.0 as an intermediate or final runtime.
- Retaining third-party component libraries by aliasing `solid-js/web`, `solid-js/store`, or removed core APIs.
- Adding an application-specific RPC system; the official Vite plugin server-function runtime remains the transport.

## User-Visible Requirements

1. The browser app opens at the same URLs and redirects `/` to the default project exactly as before.
2. Project, ticket, launcher, board, forest, diff review, settings, sync, and cleanup workflows retain their current behavior.
3. Loading, stale-data, polling, retry, and error states do not regress or flash the whole application unexpectedly.
4. Dragging cards, columns, prompts, and skills retains keyboard/pointer behavior covered by existing tests.
5. Dialogs, menus, tabs, floating panels, and split panes retain focus, dismissal, accessibility, and sizing behavior.
6. Forest pan, zoom, node movement, grouping, connection creation, external connections, and viewport persistence remain functional.
7. Electron continues to load the app through `app://context-launch`, call the server in-process without a socket, preserve local storage origin, and shut down background services cleanly.
8. The browser launcher still builds once, serves the built artifact, retires stale servers, and rebuilds stale output.

## Technical Requirements

### Toolchain

- Use exact mutually compatible prerelease versions during this ticket: `solid-js@2.0.0-rc.0`, `@solidjs/web@2.0.0-rc.0`, `@solidjs/router@2.0.0-next.16`, and `@solidjs/vite-plugin@3.0.0-next.28`. Pin exact versions because prerelease APIs are changing.
- Add and pin direct `vite@7.3.5`, matching the version already used for the Vitest override and supported by the new Solid plugin and Tailwind plugin.
- Configure `@solidjs/vite-plugin` with client Start mode and server functions: `solid({ start: true, serverFunctions: true })`, not SSR.
- Replace `app.config.ts` with `vite.config.ts`, `vinxi dev/build` with `vite dev/build`, and `.output` assumptions with `dist/client` and `dist/server/server.js`.
- Set TypeScript `jsxImportSource` to `@solidjs/web` and source JSX/DOM types from `@solidjs/web`.

### Routing And Data

- Define the three application routes as a module-level `createRouter` route tree. Do not retain SolidStart file-route generation for this small static route set.
- Use lazy route components and Router 2 typed `paths` for navigation instead of string duplication where practical.
- Replace `createAsync`/`createNonSuspendingAsync` with async `createMemo` or `createProjection` under explicit `Loading`/`Errored` boundaries.
- Keep `query` as the cached read boundary. Convert mutation entry points to Router/Solid `action` and invoke them through router action APIs where UI submission coordination is needed.
- Preserve targeted cache invalidation. Replace broad string-key invalidation with query/action keys and `refresh`/`revalidate` according to the Router 2 API.
- Keep the two externally consumed file/reference content endpoints as explicit handlers in the Start middleware chain because their raw response bodies are not server-function values. They must be handled by the same web-standard server dispatch, not a second server framework.

### Reactivity

- Convert Solid 1 single-body effects to Solid 2 compute/apply effects. Reads belong in the compute phase; DOM, storage, timers, listeners, and other effects belong in apply and return cleanup.
- Replace `on(...)` with effect compute functions and native `defer` options.
- Replace `onMount` with `onSettled` and returned cleanup.
- Remove `batch`; rely on default microtask batching. Use `flush()` only at explicit imperative or test synchronization points.
- Refactor writes currently performed during tracked computations. Derived values become memos/stores; asynchronous loading becomes async computations; user changes remain event/action writes. Do not globally enable `ownedWrite`.
- Audit every call site that writes and immediately reads. Use functional setters or compute the next value before writing; do not scatter `flush()` through production code.

### JSX And DOM

- Replace `Suspense` with `Loading` and `ErrorBoundary` with `Errored`, accounting for accessor-shaped error/fallback values.
- Replace `splitProps` with `omit`; avoid creating a compatibility implementation.
- Import `Portal`, renderer types, and renderer helpers from `@solidjs/web`.
- Replace `classList` with Solid 2 `class` object/array values.
- Replace `on:pointerdown` with supported camel-case handlers or ref-based native listeners where listener options are required.
- Replace `<Context.Provider>` with the context component itself and remove wrapper hooks that only narrow missing contexts.
- Keep default keyed `For` callbacks in raw-item form. Explicitly choose another `keyed` mode only when identity semantics require it.

### Hosting And Packaging

- Introduce one application-owned `Request -> Promise<Response>` hosting boundary used by Node and Electron.
- Serve immutable files from `dist/client`; use `dist/client/index.html` as SPA history fallback; dispatch `/_server` and explicit raw API endpoints through `dist/server/server.js`.
- Register a fetch-style Start middleware for the raw routes and request logging so development, preview, Node, and Electron share the same endpoint behavior.
- Adapt Node `IncomingMessage`/`ServerResponse` only at `scripts/serve.mjs`.
- Adapt Electron `app://` requests to web `Request` only at `electron/app-protocol.ts`/`electron/server-adapter.ts`.
- Remove `src/server/publish-server-app.ts`, Nitro globals, and Nitro `localFetch` types.
- Continue exposing application service lifecycle operations (`fileWatcher`, `operationTracker`, `projectRegistry`) to Electron through an application-owned server services interface; this must not depend on the framework handler.

### Dependency Compatibility

Current published tarballs were inspected, not merely their peer ranges:

- `@thisbeyond/solid-dnd@0.7.5` imports `solid-js/web`, `solid-js/store`, `mergeProps`, `batch`, `onMount`, and old effect forms.
- `solid-resizable-panels@0.5.4` imports `solid-js/web`, `solid-js/store`, `produce`, `createComputed`, `batch`, `on`, and old lifecycle/effects.
- `@dschz/solid-flow@0.1.4` imports `solid-js/web`, `solid-js/store`, `Index`, `mergeProps`, `splitProps`, `unwrap`, `produce`, `batch`, and old lifecycle/effects.
- `lucide-solid@1.31.0` imports `solid-js/web` and `splitProps`.
- `@ark-ui/solid@5.38.1` and its Solid adapter graph import `solid-js/web` and Solid 1-compiled renderer helpers.

Therefore, before upgrading Solid:

- Replace direct icon-package usage with an application-owned Solid icon renderer and static Lucide icon data.
- Replace the single resizable panel use with an application-owned accessible pointer/keyboard splitter.
- Replace Ark-backed application UI primitives with application-owned dialog/menu/tabs/floating-panel primitives while preserving their public application interfaces.
- Replace Solid DnD with application-owned pointer/keyboard drag primitives and domain-owned drag event types.
- Replace Solid Flow with an application-owned forest viewport/graph renderer based on DOM/SVG and the existing forest model/layout modules.
- Remove all five Solid 1 runtime packages after their application seams have no consumers.

These replacements are intentional architecture work. Aliasing old import paths or patching files in `node_modules` is prohibited.

## Implementation Decisions

This section is the design authority for implementation and planning.

### 1. Use Solid 2's Vite Start Mode, Not SolidStart 2

The SolidStart maintainers state that SolidStart 2 remains on Solid 1 and excludes Router 2 prereleases. The official Solid Vite plugin now states: “Start is now a mode of the plugin: the serving layer that replaces SolidStart.” It supports client mode, retained server-function output, generated entries, and `dist/client` plus `dist/server`. This directly matches the app's existing CSR plus local backend architecture.

Decision: remove `@solidjs/start`, Vinxi, Nitro, and authored Start entries. Use generated client Start entries around `src/app.tsx` plus a custom document shell for the critical appearance script and metadata.

### 2. Keep CSR And Use The Generated Static Shell

The Vite plugin documents client Start mode as rendering a static shell, mounting the app only in the browser, providing history fallback, and retaining `dist/server` when server functions are enabled.

Decision: keep `ssr` false/omitted. Create `src/Document.tsx` for the current document metadata and critical appearance CSS/script. Do not carry forward `entry-server.tsx` or hydration-only complexity.

### 3. Use Explicit Router 2 Configuration

Router 2 makes a module-level `createRouter` instance and route config the single source of truth for matching and typed paths. It removes the old component router shape and supports lazy route components.

Decision: create `src/router.tsx` with `/`, `/add-project`, and `/project/:projectSlug`; move route implementations to page modules; render the router instance in `app.tsx`. This route seam is created under the old runtime before the final cutover where feasible.

### 4. Preserve Server Functions, Modernize Their Consumers

The Vite plugin natively compiles `"use server"`; Router 2 retains `query` and action/server-function integration. Replacing 81 functions with custom RPC would discard the framework's idiom and create unnecessary protocol code.

Decision: retain server directives and feature API module boundaries. Reads remain named queries consumed by async Solid primitives. Mutations become actions at the UI boundary, with targeted invalidation. Add `server-only` boundary markers to modules that directly reach filesystem/git/service code.

### 5. Make Hosting Web-Standard

The built plugin entry exposes `handleRequest(request)` and a Fetchable default export. Official examples adapt Node HTTP at the edge and serve `dist/client` before falling through to the handler.

Decision: application code speaks `Request` and `Response`. Node and Electron each have a thin edge adapter. Static-file/history fallback logic is shared so browser and Electron execute the same artifact semantics.

### 6. Remove Solid 1 Runtime Dependencies Before Cutover

Peer dependency ranges are insufficient evidence. Tarball inspection shows all five Solid UI dependencies execute APIs removed by the Solid 2 migration guide. Compatibility aliases would preserve the wrong architecture and still leave old effect semantics.

Decision: replace them behind application-owned seams while Solid 1 tests still run. The forest and drag replacements must expose domain vocabulary, not clone vendor APIs. This is required scope, not an optional cleanup.

### 7. Adopt New Async And Effect Semantics Directly

Solid 2 removes `createAsync`, changes readiness from Suspense resources to async computations, splits effects, delays write visibility until batch flush, and forbids writes from tracked scopes in development.

Decision: delete `createNonSuspendingAsync`; model data as async memos/projections under local `Loading`/`Errored` boundaries. Rewrite every application effect according to its purpose. Do not introduce compatibility helpers named after Solid 1 APIs.

### 8. Pin The Prerelease Cohort

As of the research date, Solid core's `next` tag is `2.0.0-rc.0`, Router's `next` tag is `2.0.0-next.16`, and the new Vite plugin is `3.0.0-next.28`. SolidStart 2.0 stable depends on Solid 1.9.

Decision: pin exact versions as one tested cohort and document the pins in `package.json`. Do not use caret ranges until Solid 2 and Router 2 are stable and a separate upgrade validates them.

## Acceptance Criteria

- `package.json` and lockfile contain Solid 2, `@solidjs/web`, Router 2, and the new Vite plugin at the pinned cohort.
- `@solidjs/start`, `vinxi`, `vite-plugin-solid`, `@ark-ui/solid`, `@thisbeyond/solid-dnd`, `@dschz/solid-flow`, `solid-resizable-panels`, and `lucide-solid` are absent.
- No source import references `solid-js/web`, `solid-js/store`, or `@solidjs/start`.
- No source use remains of `createAsync`, `createNonSuspendingAsync`, `Suspense`, `ErrorBoundary`, `splitProps`, `mergeProps`, `onMount`, `on`, `batch`, `classList`, `on:*`, or `.Provider`.
- No production `flush()` call exists unless accompanied by a narrowly scoped comment explaining the imperative synchronization requirement.
- No dev warning/error is emitted for top-level reactive reads or writes inside reactive scopes during E2E coverage.
- The production build creates `dist/client/index.html` and `dist/server/server.js` and no `.output`/`.vinxi` artifact is required.
- Browser and Electron smoke tests prove static assets, history fallback, server functions, raw content endpoints, and custom-origin behavior.
- Existing product specs and E2E tests pass after locator-neutral internal changes.
- `npm run test:all` and Electron distribution build pass on the supported platform.

## Authoritative Sources

- Solid 2 migration guide: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md
- Solid 2 release discussion: https://github.com/solidjs/solid/discussions/2596
- Solid 2 documentation: https://docs.solidjs.com/v2/getting-started
- Solid Vite plugin Start mode and server functions: https://github.com/solidjs/solid-vite-plugin/blob/next/README.md
- Solid Vite plugin official turnkey example: https://github.com/solidjs/solid-vite-plugin/tree/next/examples/turnkey
- Solid Router 2 README and migration guide: https://github.com/solidjs/solid-router/blob/next/README.md
- SolidStart v2 migration guide: https://docs.solidjs.com/solid-start/v2/migrating-from-v1
- SolidStart roadmap clarification: https://github.com/solidjs/solid-start/discussions/2119
- SolidStart package/release compatibility: https://github.com/solidjs/solid-start/releases
- npm registry metadata for all pinned and inspected packages, queried 2026-08-14.
