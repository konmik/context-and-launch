# ST-0066 Detailed Implementation Plan

## Planning Rules

- Follow the PRD's Implementation Decisions as design authority.
- Work in the sequence below. Steps 1-7 create and prove behavior-preserving seams on Solid 1. Step 8 performs the runtime/toolchain cutover. Steps 9-13 adopt Solid 2 APIs on those seams.
- Keep each seam step independently testable and commit-sized. Do not mix the Solid version upgrade into dependency replacement work.
- Do not patch `node_modules`, add removed-import aliases, or create Solid 1 compatibility APIs.
- Existing unrelated worktree changes must be preserved.

## Repository Findings And Design Resistance

| Resistance | Evidence | Resolution |
| --- | --- | --- |
| SolidStart 2 is not Solid 2 compatible | Current stable `@solidjs/start@2.0.0` depends on Solid 1.9 and declares Router `<2.0.0-0` | Replace SolidStart with official `@solidjs/vite-plugin` Start client mode |
| Build/host code is Nitro-shaped | `app.config.ts`, `publish-server-app.ts`, Electron `localFetch`, `.output/server/index.mjs`, and launch scripts | Create an application-owned web `Request -> Response` built-app boundary, then adapt Node/Electron at their edges |
| File routing hides a tiny static route model | `FileRoutes` plus three page route files | Create one explicit Router 2-compatible route tree and typed paths |
| Data loading encodes a Solid 1 Suspense workaround | `src/lib/create-non-suspending-async.ts` and 12 consumers/tests | Replace it after cutover with async memos/projections and explicit local Loading/Errored ownership |
| Effects mix dependency reads, writes, I/O, and cleanup | 77 effect references across route/controllers/components | Classify each effect, establish explicit compute/apply phases, replace derivation writes with memos, and return cleanup |
| Immediate signal reads are assumed | Controllers/tests use Solid 1 synchronous setter visibility | Convert production logic to functional setters/precomputed values; use `flush` only in tests or true imperative boundaries |
| Vendor DnD types leak into domain state | `board-state`, `board-logic`, `list-reorder`, and components import `@thisbeyond/solid-dnd` | Define domain drag events/IDs and an application drag adapter before replacing the implementation |
| Forest rendering is coupled to Solid Flow types and components | Five forest modules import `@dschz/solid-flow`; the package tarball uses numerous removed APIs | Keep existing forest model/layout domain code and replace only the viewport/renderer with application DOM/SVG primitives |
| UI wrappers still execute Ark's Solid 1 build | Four `components/ui` modules delegate to Ark; tarball imports old renderer | Preserve application wrapper contracts while replacing internals with local accessible primitives |
| Icons and panels are compiled against Solid 1 | 50+ icon imports and one split-pane import | Add local icon and splitter seams, migrate consumers, then remove packages |
| Raw API routes rely on SolidStart filesystem handling | Two route modules return content responses | Move handlers into application server dispatch under the same web handler and add direct response tests |
| Test config manually emulates Solid browser resolution | `vitest.config.ts` builds `solidVite` using old plugin and `as any[]` | Adopt the new plugin's documented Vitest client/server postures after cutover |

## Step 1: Freeze Baseline Contracts

**Files to create/modify**

- Create `src/server/built-app-contract.test.ts` or equivalent focused tests.
- Modify `electron/app-protocol.test.ts`.
- Modify relevant E2E helpers/tests only to add missing behavior assertions, not to change behavior.
- Create any needed hosting fixture under the existing `e2e` fixture conventions rather than embedding ad hoc setup in tests.

**Changes**

- Record baseline response behavior for `/`, a deep `/project/:slug` URL, one static asset, `/_server`, both raw file/reference content endpoints, unknown paths, GET/HEAD, and request bodies.
- Extend Electron protocol tests to assert query strings, custom-origin host/protocol, headers, redirects, bodies, and static/history/server-function routing.
- Ensure existing tests cover root redirect, loading/stale data behavior, dialogs/menus/tabs, drag operations, split pane persistence, forest viewport and connections, and packaging startup. Add only missing high-value assertions.
- Capture the baseline `npm run test:all` result before refactors. If the environment needs the repository's workspace/ramdisk harness, use the documented runner rather than bypassing it.

**Why**

Hosting and reactive timing both change. These contracts distinguish intentional internal changes from product regressions.

**Acceptance criteria**

- New tests pass on the current Solid 1 implementation.
- Every hosting path that will move off Nitro has an observable contract test.
- The baseline full gate result is recorded in the implementation notes/commit message.

## Step 2: Create Framework-Neutral Hosting And Artifact Seams

**Files to create/modify**

- Create `src/server/app-services.ts`.
- Create `src/server/built-app.ts`.
- Create `src/server/static-response.ts` and tests.
- Modify `src/server/publish-server-app.ts`.
- Modify `electron/server-adapter.ts` and `electron/app-protocol.ts` plus tests.
- Modify `scripts/serve.mjs` plus shell/E2E startup tests.
- Modify `electron-builder.yml`, `run.ps1`, `run.sh`, and stale-output tests to consume centralized artifact-path constants or equivalent single-source conventions.

**Changes**

- Define the application hosting contract as `handleRequest(request: Request): Promise<Response>` plus an explicit `AppServices` interface for logging, file-watcher shutdown, operation draining, and project listing.
- Under Solid 1, adapt Nitro `localFetch` behind this contract. Keep Nitro knowledge only in `publish-server-app.ts` during this seam step.
- Change `handleAppRequest` to construct/forward a web `Request` rather than expose Nitro's `{ host, protocol, ... }` shape to the rest of Electron. Preserve the fixed `app://context-launch` origin.
- Put static-file safety rules, MIME handling, HEAD behavior, and SPA fallback behind application-owned functions. Initially delegate to Nitro where necessary, but make callers independent of Nitro.
- Make Node and Electron consume the new contract. Keep app service publication separate from request-handler publication.
- Centralize current artifact paths enough that Step 8 changes them once rather than editing scattered assumptions.

**Why**

The new plugin exports a web-standard handler, while current consumers require Nitro `localFetch`. This seam allows the framework swap without simultaneously rewriting all host code.

**Acceptance criteria**

- Browser and Electron behavior is unchanged on SolidStart 1.
- `electron/app-protocol.ts` and `scripts/serve.mjs` depend only on web `Request`/`Response` and application contracts, not Nitro types.
- Nitro-specific code is confined to `app.config.ts` and `src/server/publish-server-app.ts`.
- Step 1 contract tests and shell/Electron tests pass.

## Step 3: Replace File Routes With An Explicit Router Seam

**Files to create/modify**

- Create `src/router.tsx`.
- Create `src/pages/index.tsx`, `src/pages/add-project.tsx`, and `src/pages/project.tsx` by moving code from current UI route files.
- Modify `src/app.tsx`.
- Delete `src/routes/index.tsx`, `src/routes/add-project.tsx`, and `src/routes/project/[projectSlug].tsx` once no longer consumed.
- Add/modify router tests.

**Changes**

- Build a module-level explicit route definition for `/`, `/add-project`, and `/project/:projectSlug`, using lazy page components.
- Preserve current navigation behavior under Router 0.x using the closest supported config form, while shaping `src/router.tsx` so Step 9 can replace only router construction/API details.
- Export route-building helpers/path constants from one place. Migrate direct route string construction where it improves correctness without broad unrelated cleanup.
- Keep the root application Error/Loading layout outside page modules.

**Why**

Router 2 removes the old component router API and treats one immutable route tree as the source of truth. A three-route app gains nothing from retaining a file-route generator tied to SolidStart.

**Acceptance criteria**

- All three routes and deep-link/history behavior pass under Solid 1.
- `app.tsx` no longer imports `FileRoutes` or `@solidjs/start/router`.
- UI route code lives outside `src/routes`, leaving that directory only for the two raw server endpoints until Step 8.

## Step 4: Isolate And Replace Icons, Splitter, And Ark UI

**Files to create/modify**

- Create `src/components/ui/icon.tsx` and `src/components/ui/icons.ts` (or one cohesive module).
- Modify every file currently importing `lucide-solid` (the import inventory in the PRD/repository search is authoritative).
- Create `src/components/ui/split-pane.tsx` and tests.
- Modify `src/components/ticket/ticket-detail-launcher-tab.tsx`.
- Rewrite internals of `src/components/ui/dialog.tsx`, `menu.tsx`, `tabs.tsx`, and `floating-panel.tsx`; add focused accessibility/interaction tests.
- Modify consuming render tests only where vendor-only DOM details disappear.
- Modify `package.json`/lockfile to remove `lucide-solid`, `solid-resizable-panels`, and `@ark-ui/solid` after migration.

**Changes**

- Implement one renderer-neutral icon component over static Lucide icon node data, preserving `size`, stroke, class, and accessible labeling semantics. Re-export only icons the app uses.
- Implement the vertical ticket detail splitter with pointer capture, keyboard arrow resizing, min/max constraints, ARIA separator semantics, and existing persistence callbacks.
- Implement application-owned dialog/menu/tabs/floating panel behavior through native DOM and Solid primitives. Preserve wrapper APIs used by the app, focus restoration, Escape/outside dismissal, modal focus containment, menu keyboard navigation, tab ARIA relationships, portals, and test IDs.
- Avoid reproducing Ark's generic API. Implement only the application contract exposed by the four wrapper modules.

**Why**

These packages execute Solid 1-compiled renderer and lifecycle code. The existing wrappers are already the correct seam; their internals must become Solid-owned before the runtime changes.

**Acceptance criteria**

- No application file imports the three removed packages.
- Dialog/menu/tabs/floating panel keyboard and focus tests pass.
- Split pane resize and persistence E2E tests pass.
- Visual class names/test IDs used by product tests remain stable unless a vendor-only detail had no product meaning.

## Step 5: Replace Vendor DnD Behind Domain Events

**Files to create/modify**

- Create `src/components/drag/drag-types.ts`, `drag-provider.tsx`, `sortable.ts`, and focused tests (names may vary, module boundary may not).
- Modify `src/components/board/kanban-id.ts`, `board-logic.ts`, `board-state.ts`, `list-reorder.ts`, `dnd-shared.tsx`, `kanban-columns.tsx`, and `KanbanBoard.tsx` plus tests.
- Modify `src/components/launcher/AgentLauncher.tsx`, `launcher-settings-columns-tab.tsx`, `launcher-settings-prompts-tab.tsx`, and `launcher-settings-rows.tsx` plus tests.
- Remove `@thisbeyond/solid-dnd` from `package.json`/lockfile.

**Changes**

- First define application drag IDs and events containing only domain-required fields: active ID, source/destination identity, pointer/keyboard intent, and collision target. Migrate state/logic modules off vendor types without changing the renderer.
- Then implement an application drag provider using Pointer Events, pointer capture, measured droppable rectangles, keyboard movement, closest-target selection, drag overlay, cancellation, and cleanup.
- Preserve the existing board cross-column insertion preview, orphan column behavior, list reorder semantics, DND active CSS state, and skill/prompt/column reorder behavior.
- Keep collision/ordering calculations pure and independently tested. DOM event plumbing must not leak into board domain state.

**Why**

Vendor event types currently couple pure domain logic to a package that cannot load on Solid 2. Separating the domain seam first makes replacement testable and keeps the resulting module deep.

**Acceptance criteria**

- No vendor DnD type or import remains.
- Pure reorder/state tests pass unchanged in intent.
- Pointer and keyboard E2E drag scenarios pass for board cards, columns, prompts, and skills.
- Cancellation and component disposal leave no global listeners or stale overlay.

## Step 6: Replace Solid Flow With A Native Forest Renderer

**Files to create/modify**

- Create `src/components/forest/forest-viewport-controller.ts`, `forest-graph-surface.tsx`, and focused geometry/interaction tests, or equivalent cohesive modules.
- Modify `forest-flow-model.ts` to return application-owned node/edge geometry types and rename it if its name becomes misleading.
- Modify `forest-local-state.ts`, `forest-viewport.ts`, `ForestDependencyEdge.tsx`, `ForestCard.tsx`, `ForestSurface.tsx`, and related tests/E2E helpers.
- Remove `@dschz/solid-flow` from `package.json`/lockfile.

**Changes**

- Preserve existing forest graph/domain modules (`forest-graph`, grouping, connection sessions, layout persistence) and replace only vendor viewport/rendering responsibilities.
- Define application node, edge, position, viewport, and handle types. Remove vendor types from model and persistence modules first.
- Render cards in a transformed DOM layer and dependency/external edges in SVG. Reuse existing computed node positions and edge relations.
- Implement pan, wheel zoom centered on pointer, fit/restore viewport, node dragging, selection, connection handle gestures, external path clipping, overlays, resize observation, and persisted position writes.
- Preserve context commands and test IDs while migrating providers in Step 10.

**Why**

Solid Flow's published build imports nearly every major API removed by Solid 2. The app already owns graph semantics and layout; a native renderer removes a large unmaintained compatibility risk without changing the domain model.

**Acceptance criteria**

- No `@dschz/solid-flow` import or type remains.
- Forest layout, viewport, subforest window, grouping, lifecycle, connection mode, and connection E2E suites pass.
- Panning/zooming/node movement are bounded and persisted as before.
- SVG edges track moved/resized nodes and external connections correctly.

## Step 7: Prepare Server Boundaries And Remove Remaining Solid 1 Vendor Runtime

**Files to create/modify**

- Modify the ten feature API modules containing `"use server"`.
- Create `src/server/raw-routes.ts`, `src/server/middleware.ts`, and tests.
- Move/delete the two `src/routes/api/...` files.
- Create/update an ambient types file for `server-only`/`client-only` markers after the plugin lands; before cutover, keep imports staged if current tooling cannot resolve them.
- Modify `package.json`/lockfile.

**Changes**

- Separate raw endpoint handler functions from filesystem route filenames and register them by pathname/method in a fetch-style Start middleware. The middleware returns raw responses for those endpoints and delegates all other requests with `next()`; it also replaces the current request-logging middleware without relying on SolidStart server-function metadata internals.
- Preserve content type, status, validation, path decoding, ranges/caching if currently supported, and body streaming.
- Ensure feature API modules have clean server boundaries: server function bodies call core services; UI modules do not import server-only implementation modules except through transformed server functions.
- Verify all five Solid 1 runtime dependencies are absent and no transitive app import depends on their component builds.

**Why**

The runtime cutover should fail only on application API changes, not on hidden vendor code or SolidStart route discovery.

**Acceptance criteria**

- Raw endpoint contract tests pass independently of SolidStart route discovery.
- A dependency/import scan finds none of the five prohibited packages in the app graph.
- Existing server-function unit tests still pass on Solid 1.

## Step 8: Cut Over Toolchain, Build, Hosting, And Packaging

**Files to create/modify/delete**

- Create `vite.config.ts` and `src/Document.tsx`.
- Modify `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `scripts/electron-dist.ts`, `scripts/serve.mjs`, `run.ps1`, `run.sh`, shell/E2E stale-output tests, `electron/server-adapter.ts`, `electron-builder.yml`, and `.gitignore`.
- Delete `app.config.ts`, `src/entry-client.tsx`, `src/entry-server.tsx`, the old `src/middleware.ts`, and `src/server/publish-server-app.ts` after their responsibilities move to `src/Document.tsx`, `src/server/middleware.ts`, and server configuration.

**Changes**

- Pin `solid-js@2.0.0-rc.0`, `@solidjs/web@2.0.0-rc.0`, `@solidjs/router@2.0.0-next.16`, and `@solidjs/vite-plugin@3.0.0-next.28`; add compatible direct Vite; remove SolidStart, Vinxi, and old Vite plugin.
- Configure `solidPlugin({ start: { middleware: "./src/server/middleware.ts" }, serverFunctions: { configure: "./src/server-config.ts" } })`, Tailwind, alias, build target, watch ignore, and required dependency optimization in normal Vite config. `src/server-config.ts` must register Router single-flight integration and side-effect publish the shared application services when the built server module loads.
- Put current `<html>`, metadata, favicon, critical background CSS, and appearance script in `Document.tsx`; client mode must not include hydration machinery.
- Set `jsxImportSource` to `@solidjs/web` and add plugin boundary-module types.
- Adopt the new plugin in Vitest. Keep separate client jsdom and server node projects per official guidance; eliminate `as any[]` plugin coercion and manual Solid condition emulation where the plugin now owns it.
- Change all build scripts/artifact freshness checks/packaging globs from Vinxi `.output` to `dist/client` and `dist/server/server.js`.
- Load the built handler's `handleRequest` in Node/Electron. Serve safe static paths first, SPA fallback to `dist/client/index.html`, and dispatch server functions/raw API requests to the handler/registry.
- Publish application services independently from the framework handler so Electron lifecycle methods remain available.

**Why**

All framework-independent seams now exist. This step performs one coherent package/artifact swap without mixing UI vendor rewrites into it.

**Acceptance criteria**

- `npm install` succeeds without peer override flags.
- A minimal `vite build` emits `dist/client/index.html` and `dist/server/server.js`.
- Browser and Electron hosting contract tests pass with the new artifact.
- No `.output`, `.vinxi`, Nitro, Vinxi, or SolidStart assumption remains outside historical test descriptions that were deliberately updated.

## Step 9: Migrate Router 2 And Server Data APIs

**Files to create/modify**

- Modify `src/router.tsx`, `src/app.tsx`, and all three page modules.
- Modify all feature API modules importing `query`.
- Modify `project-page-controller.ts`, `ticket-detail-state.ts`, `worktree-revision.ts`, `DiffReview.tsx`, `ForestView.tsx`, launcher settings state modules, and any other `revalidate` consumer.
- Modify router/data mocks in `TicketDetailDialog.test.tsx`, `ticket-detail-upload.test.ts`, `herdr-status-api.test.ts`, and related tests.

**Changes**

- Instantiate Router 2 with `createRouter({ routes })`, render the instance with root layout children, and use typed paths/params/navigation.
- Update Router query signatures/keys to Router 2. Keep named stable keys and argument-specific keys.
- Wrap mutation server functions as Router 2 actions at API boundaries. Use `useAction` for imperative invocation from controls and real form actions where existing forms map naturally.
- Replace old broad `revalidate` calls with Router 2 targeted invalidation or Solid `refresh`, preserving polling and post-mutation freshness.
- Register Router 2's single-flight collector through the Vite plugin `serverFunctions.configure` hook in `src/server-config.ts`, not lazily in the app graph.

**Why**

Router 2 is an architectural API change, not an import bump. Its route instance, paths, async reads, actions, and server collector should be adopted as one coherent data/navigation layer.

**Acceptance criteria**

- Navigation/deep links/back-forward pass.
- Query deduplication, polling, targeted invalidation, and mutation refresh tests pass.
- No Router 0.x component API, `createAsync`, query cache mutation (`query.get/set`), or obsolete submission API remains.

## Step 10: Migrate Async UI, Boundaries, Context, And DOM Syntax

**Files to create/modify/delete**

- Delete `src/lib/create-non-suspending-async.ts` and its Solid 1-specific tests.
- Modify `app.tsx`, page modules, `ticket-detail-state.ts`, `worktree-revision.ts`, `ForestView.tsx`, `DiffReview.tsx`, and all helper consumers.
- Modify context modules/providers in board, ticket, forest, and tests.
- Modify files identified by searches for `Suspense`, `ErrorBoundary`, `classList`, `on:`, `.Provider`, `splitProps`, `solid-js/web`, `solid-js/store`, and Solid-owned `JSX` types.

**Changes**

- Model each async read with `createMemo(() => query(...))` or `createProjection` for deeply reactive collections. Place readiness UI under the narrowest `Loading` boundary and errors under `Errored`.
- Preserve stale content during polling/revalidation using Solid 2 pending/latest/refresh semantics rather than the removed helper's initial-value trick. Use `isPending` only for updates whose pending state is user-visible; note that bare `refresh` is intentionally silent.
- Replace root and local boundaries and update error fallback accessor/reset behavior.
- Convert context providers to context components and simplify missing-context hooks according to Solid 2's default-less context behavior.
- Convert store imports to `solid-js`, renderer imports/types to `@solidjs/web`, `splitProps` to `omit`, `classList` to `class`, and namespaced pointer handlers to supported event/ref forms.
- Review each `For` callback. Default keyed lists receive raw item plus index accessor; update only callbacks that currently assume otherwise.

**Why**

This removes the central Solid 1 compatibility abstraction and adopts Solid 2 readiness, error, renderer, and context ownership directly.

**Acceptance criteria**

- The prohibited API/import search in the PRD is clean for this category.
- Initial load, retry, background polling, and stale-data E2E tests pass without full-page fallback flashes.
- No top-level reactive-read warnings occur in covered UI.

## Step 11: Rewrite Effects, Lifecycle, Cleanup, And Batched Writes

**Files to modify**

- Route/page effects: `src/pages/index.tsx`, `src/pages/project.tsx`.
- Shared effects: `use-mod-enter-submit.ts`, `use-escape-key.ts`, `worktree-revision.ts`, `conflict-dialog-controller.ts`, `ExpandingOverlay.tsx`, `LogTextView.tsx`, `LogViewerDialog.tsx`, `MarkdownEditor.tsx`, `PalettePicker.tsx`, `TicketCleanupDialog.tsx`.
- Project/ticket effects: `add-project-controller.ts`, `BoardSelect.tsx`, `project-page-controller.ts`, `create-ticket-controller.ts`, `ticket-detail-launcher-tab.tsx`, `ticket-detail-state.ts`.
- Launcher effects: `agent-launcher-controller.ts`, `command-template-settings-state.ts`, `launcher-settings-state.ts`, `LauncherSettings.tsx`, `ProjectLauncherDialog.tsx`, `prompt-preview-controller.ts`.
- Diff/forest effects: `DiffReview.tsx`, `DiffSurface.tsx`, `ReviewPromptComposer.tsx`, `ReviewPromptQueueList.tsx`, `VerticalReveal.tsx`, and the new native forest modules.
- Related tests using Solid roots/signals.

**Changes**

- Classify every old effect before editing:
  - pure derivation becomes `createMemo`/derived signal/store;
  - explicit dependency plus side effect becomes split `createEffect(compute, apply, options)`;
  - mount/measurement/listener setup becomes `onSettled` returning cleanup;
  - asynchronous fetch/state synchronization becomes an async computation or action, not a tracked effect that writes app state;
  - event-driven state changes stay in handlers/actions.
- Return timer/listener/observer cleanup from apply/onSettled. Remove standalone `onCleanup` where lifecycle return now owns it; retain only supported owner cleanup uses that are not effect cleanup.
- Remove `on` and use compute functions plus `{ defer: true }` where initial execution was intentionally skipped.
- Remove `batch` blocks from launcher settings. Ensure dependent calculations use known next values rather than immediate reads.
- Audit signal setter/read sequences in production and tests. Prefer functional setters and awaited microtask settlement. Use `flush()` only for tests or unavoidable imperative interop and document any production use.
- Run with development diagnostics enabled and treat top-level reads/writes-in-owned-scope as failures.

**Why**

Mechanical import replacement would compile incorrectly: Solid 2 effects have compute/apply phases, writes flush later, and tracked-scope writes throw in development.

**Acceptance criteria**

- No `onMount`, `on(...)`, or `batch` import/use remains.
- Every effect has an explicit side-effect purpose; derivation-only effects are gone.
- Covered development runs emit no reactive diagnostics.
- Controller tests explicitly await settlement where needed and pass without production `flush` proliferation.

## Step 12: Complete Store And Component API Migration

**Files to modify**

- `src/components/forest/ForestSurface.tsx` or its replacement store module.
- Any component/type file still importing Solid 1 renderer-neutral JSX types.
- All tests using `createRoot`/signal mutation timing.

**Changes**

- Convert `createStore`/`reconcile` imports to `solid-js`; use draft-first setters and the Solid 2 `reconcile(value, key)` signature.
- Replace any old path setters with draft updates rather than `storePath` unless path data is genuinely dynamic.
- Use `Element` from `solid-js` for renderer-neutral children and `JSX`/`ComponentProps` from `@solidjs/web` for DOM APIs.
- Remove obsolete type assertions/mocks made necessary by Router/Solid 1 APIs.

**Why**

Store behavior and JSX ownership are explicit Solid 2 changes and should not be left as incidental compiler fixes.

**Acceptance criteria**

- No `solid-js/store`, Solid-owned `JSX`, removed store helper, or old reconcile signature remains.
- TypeScript passes without broad `any` additions.

## Step 13: Verification, Diagnostics, And Documentation

**Files to modify**

- Modify `README.md` contributor/build instructions.
- Modify comments in launch/build/test scripts that mention Vinxi/Nitro/`.output`.
- Add a short dependency pin comment or `README` note explaining the Solid 2 prerelease cohort.
- Update tests only for intentional architecture-level artifact/DOM changes.

**Changes**

- Run clean install, typecheck, lint, unit tests, shell tests, production build, test-id gate, all E2E projects, benchmark smoke if normally gated, and Electron distribution build.
- Launch the built browser app and Electron app manually/automatically enough to inspect the console for Solid development diagnostics and failed asset/server-function requests.
- Search the full source/config/scripts for all prohibited dependencies, imports, APIs, artifact names, and old framework terminology.
- Inspect the client bundle to ensure server-only core modules and secrets/filesystem code are absent.
- Inspect `dist/server/server.js` startup and service lifecycle shutdown in Electron.
- Confirm `npm ls` has one Solid 2 core/web instance and no invalid peers.

**Why**

This migration changes compiler, runtime scheduling, router, server transport, host adapters, and major UI infrastructure. Compilation alone cannot prove correctness.

**Acceptance criteria**

- All PRD acceptance criteria pass.
- `npm run test:all` passes from the repository's required test workspace.
- `npm run electron:dist` succeeds and the packaged app opens, serves assets/functions, and exits cleanly.
- Browser/Electron consoles contain no Solid diagnostics, hydration messages, unhandled rejections, missing assets, or server-function transport errors.
- README and scripts describe Vite/Solid 2 accurately.

## Required Final Searches

Run equivalent ripgrep checks and require zero relevant matches:

```text
@solidjs/start|vinxi|vite-plugin-solid|@ark-ui/solid|@thisbeyond/solid-dnd|@dschz/solid-flow|solid-resizable-panels|lucide-solid
solid-js/web|solid-js/store
createAsync|createNonSuspendingAsync|Suspense|ErrorBoundary
splitProps|mergeProps|onMount|\bon\(|\bbatch\(
classList=|on:[a-z]|\.Provider
\.output|\.vinxi|Nitro|localFetch
```

Exclude historical ticket documents and lockfile integrity text where appropriate; do not exclude production source/config/scripts.

## Verification Order

1. `npm install`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm test`
5. `npm run test:shell`
6. `npm run build`
7. `npm run test:gate`
8. `npm run test:e2e`
9. `npm run test:all`
10. `npm run electron:dist`
11. Browser and packaged Electron console/smoke inspection
