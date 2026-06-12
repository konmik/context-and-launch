# ST-0027 Adopt SolidStart Data Primitives

## Problem Statement

The client-side data layer bypasses SolidStart's built-in data primitives. Three state modules (ticket-detail-state, launcher-settings-state, agent-launcher-controller) contain ~35 ad-hoc `fetch()` calls with duplicated error handling. Each call site carries its own `.catch(e => setError(...))` / "Failed to X" plumbing. An `apiFetch()` wrapper exists but only one controller uses it.

Meanwhile ~40 API route files in `src/routes/api/` serve as an unnecessary HTTP layer between the client and the stores. SolidStart's `query()`/`action()`/`createAsync` primitives with `"use server"` eliminate this layer entirely -- server functions call stores directly, with framework-managed serialization, caching, and revalidation.

The current architecture also mandates a three-layer split (pure functions, controller factory, component) for every complex component. This produces thin controllers that are mostly fetch-and-set-signal boilerplate. With `createAsync` and `useSubmission` handling loading and error states declaratively, these controllers have too little logic to justify a separate layer.

## Solution

Migrate all client data access to SolidStart's idiomatic `query()`/`action()`/`createAsync` primitives. Server functions use `"use server"` to call stores directly, eliminating the HTTP API route layer. Components use `<Suspense>` and `<ErrorBoundary>` for read states, and `useSubmission` with typed discriminated results for mutation states. Controllers collapse into their components.

## User Stories

1. As a developer, I want all data fetching to use `query()` + `createAsync`, so that reads are cached, deduplicated, and automatically suspended
2. As a developer, I want all mutations to use `action()` + `useSubmission`, so that mutation state (pending, result, error) is tracked by the framework
3. As a developer, I want server functions to call stores directly via `"use server"`, so that no HTTP serialization/deserialization layer sits between client and server
4. As a developer, I want mutation results to be typed discriminated unions, so that error handling is type-safe without `any`-typed `submission.error`
5. As a developer, I want `<ErrorBoundary>` to catch read errors declaratively, so that no manual `setError` signals are needed for data loading
6. As a developer, I want `<Suspense>` (with no fallback) to gate rendering until data is available, so that components never see `undefined` data
7. As a developer, I want server functions colocated with the feature that uses them, so that related code lives together
8. As a developer, I want the API route files deleted, so that there is one path from client to store, not two
9. As a developer, I want `src/server/` renamed to `src/core/`, so that the directory name reflects its role as pure business logic, not an HTTP server layer
10. As a developer, I want the three-layer architecture requirement removed from CLAUDE.md, so that controllers can be collapsed into components when the controller is thin
11. As a developer, I want `parseBody` and HTTP request validation deleted, so that validation at the server function boundary relies on TypeScript types and framework serialization
12. As a developer, I want `statusCode` removed from `AppError` and `PayloadError` deleted, so that error types reflect domain errors, not HTTP semantics
13. As a developer, I want fire-and-forget side effects (like opening the config directory) to be plain `"use server"` functions without `action()` wrapping, so that no unnecessary submission tracking overhead exists
14. As a developer, I want the agent launch flow to return a typed discriminated result with `behindRemote`/`dirtyWorktree`/`error` variants, so that the component can branch UI without manual error signal juggling
15. As a developer, I want the sync-pending poller rewritten as a `query()` with `revalidate()` on a timer, so that polling uses the same data primitive as everything else
16. As a developer, I want file uploads (ticket context file upload) to go through `action()` with native `FormData`, so that uploads follow the same mutation pattern
17. As a developer, I want `apiFetch()` and `src/lib/api.ts` deleted, so that no vestigial fetch wrappers remain
18. As a developer, I want `src/lib/fetch-boards.ts`, `src/lib/add-project.ts`, `src/lib/delete-project.ts`, and `src/lib/last-used-profile.ts` replaced by colocated server functions, so that client-side fetch wrappers in `src/lib/` are eliminated
19. As a developer, I want revalidation calls to move from client-side post-fetch hooks into the `action()` server functions themselves, so that cache invalidation is colocated with the mutation
20. As a user, I want every failure path to still show an error in the UI, so that no errors are silently swallowed during the migration

## Implementation Decisions

1. All reads use `query()` + `createAsync`. Server functions throw on error; `<ErrorBoundary>` catches and displays. `<Suspense>` (no fallback prop) gates rendering until data resolves -- appropriate for a localhost Electron app with near-instant loads.

2. All mutations use `action()` + `useSubmission`. Server functions return typed discriminated results (never throw). Every code path returns a value (`{ ok: true }` on success, `{ ok: false, type: "...", message: "..." }` on failure) to prevent stale error state in `useSubmission`.

3. Fire-and-forget side effects (e.g. opening the config directory in the OS file explorer) use plain `"use server"` functions -- no `action()` wrapper, no submission tracking, no revalidation.

4. Agent launch error branching: the server function returns a discriminated union with variants `behindRemote`, `dirtyWorktree`, and `error`. The component inspects `submission.result` to show the appropriate UI (pull-and-retry button, dirty worktree warning, or generic error).

5. Server functions are colocated by feature: each feature directory under `src/components/` gets a `*-api.ts` file containing its `query()` and `action()` definitions. These files import from `src/core/` (the renamed `src/server/`) to call stores and managers directly.

6. `src/server/` is renamed to `src/core/`. Its contents (stores, managers, config, infra, error types) are pure business logic with no HTTP concerns.

7. All ~40 API route files under `src/routes/api/` are deleted. The route helpers (`withService`, `withProject`, `withTicketStore`, `parseBody`, `validated`) in `route-helpers.ts` are deleted.

8. `parseBody` and Valibot request-body schemas are deleted. TypeScript types + framework serialization are the boundary for server function arguments. Valibot schemas used for domain validation (e.g. validating config files read from disk) remain.

9. Error class cleanup: `statusCode` is removed from `AppError`. `PayloadError` is deleted. `ValidationError` and `NotFoundError` become plain `AppError` subclasses without status codes. `ProcessError`, `ErrorInfo`, `errorMessage`, and `errorPayload` remain unchanged.

10. Controllers collapse into components. The three-layer architecture recommendation is removed from CLAUDE.md. Pure function modules (e.g. `agent-launcher-pure.ts`, `ticket-detail-pure.ts`) remain when they contain real logic worth testing in isolation.

11. The sync-pending poller becomes a `query()` function. The component calls `revalidate("sync-pending")` on a `setInterval` timer. `src/lib/sync-pending-poller.ts` is deleted.

12. File uploads go through `action()` with native `FormData` parameters. `ticket-detail-upload.ts` is either inlined into the component or replaced by a server function in `ticket/ticket-api.ts`.

13. `src/lib/api.ts` (the `apiFetch` wrapper) is deleted. `src/lib/fetch-boards.ts`, `src/lib/add-project.ts`, `src/lib/delete-project.ts`, and `src/lib/last-used-profile.ts` are deleted; their logic moves into colocated `*-api.ts` server functions.

14. `src/server/actions.ts` (containing `loadProjectPage` and `getDefaultProjectSlug`) moves into `src/components/project/project-api.ts` to follow the colocation pattern.

15. Revalidation keys stay the same (e.g. `"project-page"`). `revalidate()` calls move from client-side post-fetch code into the `action()` server functions.

## Testing Decisions

Good tests for this migration verify external behavior: does the UI show the right data, does a mutation persist, does an error display. They do not test internal wiring (whether `query()` vs `fetch()` was called).

Modules to test:

- Pure function modules (`agent-launcher-pure`, `ticket-detail-pure`, `launcher-settings-pure`, `conflict-dialog-pure`, etc.) retain their existing unit tests unchanged. These modules are not affected by the migration.
- e2e tests are the primary verification for this migration. The existing Playwright e2e suite (30 test files) drives the real server against a sandboxed data directory. Every e2e test that creates, edits, deletes, launches, or syncs a ticket exercises the new `query`/`action` code path. All existing e2e tests must pass without modification to the test files themselves (only the app code changes).
- The `route-helpers.test.ts` and `open-config-dir.test.ts` tests are deleted along with their source files.
- Controller tests (`project-page-controller.test.ts`, `agent-launcher-controller.test.ts`, `ticket-detail-state.test.ts`, etc.) that mock `fetch()` are deleted or rewritten to test the component directly, since controllers collapse into components.
- `sync-pending-poller.test.ts` is deleted along with its source file.

Prior art: the e2e tests in `e2e/` use the `real-server.ts` harness, which starts the actual server against a temp directory, drives the UI with Playwright, and asserts on real side effects (config.json contents, git branches, worktrees).

## Out of Scope

- Migrating to SolidStart's `cache()` API for advanced cache control (current `query()` caching is sufficient)
- Adding loading skeletons or spinners (localhost latency does not warrant visible loading states)
- Server-sent events or WebSocket-based real-time updates (no current need)
- Migrating domain validation (Valibot schemas for config files on disk) -- only HTTP request validation is removed
- Changing the store/manager layer in `src/core/` -- internal business logic is untouched
- Progressive enhancement / no-JS form submissions (Electron app always has JS)

## Further Notes

- This ticket depends on ST-0026 (typed API contracts and route helper), which has already landed. The shared request/response types from ST-0026 inform the typed discriminated results returned by `action()` server functions.
- The migration can proceed feature-by-feature (board, ticket, launcher, project, shared) since each feature's server functions are independent. However, the `src/server/` to `src/core/` rename and error class cleanup should happen first as a preparatory step.
- After this migration, the only files under `src/routes/` will be the page routes (`index.tsx`, `add-project.tsx`, `project/[projectSlug].tsx`). The `src/routes/api/` directory will be empty and deleted.
