# Detailed Plan: Open a project in a separate window (st-0032)

Implements the PRD at `tickets/st-0032-open-a-project-in-a-separate-window/product-requirement-document.md`. The Implementation Decisions section of the PRD is the design authority for every step below.

Repo: `C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0032-open-a-project-in-a-separate-window` (SolidStart + Electron, branch `ai/st-0032-open-a-project-in-a-separate-window`).

Rules that bind every step (from repo CLAUDE.md):
- No comments unless asked. No `^`/`~` in package.json. No z-index. Never push to remote. Do not modify `status.json` in the ticket folder.
- Server reads use `query()` + `createAsync`; mutations use `action()`; fire-and-forget side effects use plain `"use server"` functions.
- No empty catch blocks, no silent fallback defaults, no swallowed errors.
- Pure function modules for stateless transforms; data types contain only fields.
- Never use bare `slug`; always `projectSlug`.
- Full gate: `npm run test:all` (tsc + eslint + unit + build + testid coverage + shell + e2e). It must pass after every step that claims completion.

## Design summary (what the end state looks like)

- Client seam: each project row in the projects dropdown gets an always-visible open-in-new-window icon button that calls `window.open("/project/" + projectSlug, projectSlug)` — the URL as target, the projectSlug as the window target name. No preload, no IPC. Same call serves desktop app and browser app mode.
- Server becomes truly multi-window: file watching is additive (`FileWatcher.watchOnly` is deleted), watchers stop only on server shutdown (`stopAll` in `electron/server-adapter.ts`) and on project removal (`deleteProject`).
- `lastUsedProjectSlug` is no longer written by `loadProjectPage`. The client fires a fire-and-forget `recordProjectFocus(projectSlug)` server call on initial project load and on window focus. Only the root redirect (`src/routes/index.tsx` via `getDefaultProjectSlug`) consumes it. Last-used therefore means last-focused (PRD req 12).
- The project page sets `document.title` from the project name (PRD req 7). Electron stops suppressing `page-title-updated`.
- Electron main process: a window registry replaces the single `mainWindow`; `window-state.json` becomes an ordered list of `{ projectSlug, bounds, maximized }` entries maintained by the main process, which learns each window's project by observing in-page navigation. `webContents.setWindowOpenHandler` intercepts the popup: existing window for that target projectSlug is focused and the popup denied; otherwise a real window is created at the project URL, at the opener's size, cascaded, clamped on-screen. Session Restore reopens the list at launch, skipping entries whose project is gone from the Project Registry, keeping entries whose project is merely unavailable on disk, clamping off-screen bounds. Closing a window removes its entry; the final close of a session does not persist its own removal. Old single-object `window-state.json` is migrated on first read.
- All desktop window bookkeeping (restore-list mutations incl. close semantics, cascade/clamp math, state migration, focus order, URL parsing) lives in a new pure module `electron/window-bookkeeping.ts`, unit-tested without the desktop runtime.

## Current-state map (verified 2026-07-18)

- `src/core/board/project-page-service.ts` — `loadProjectPage` calls `this.projectRegistry.setLastUsed(projectSlug)` (line 38) and `this.fileWatcher.watchOnly(worktreeDir)` (line 44). Both couple "page load" to single-window assumptions.
- `src/core/infra/file-watcher.ts` — `watchOnly(worktreeDir)` (lines 70-75) stops every other watcher then delegates to additive `watch()`. `stop`, `stopAll` exist. The constructor callback invalidates `SyncPendingTracker` (wired in `src/core/config/service-container.ts` line 42).
- `src/core/board/sync-pending.ts` — server-side cache; only invalidated by the watcher callback and by mutations (`ticket-api.ts:204`, `launcher-api.ts:291`). If a project's watcher is stopped, the pending-badge poll on that project's page returns a stale cached value forever. This is the observable effect that pins additive watching in e2e.
- `src/routes/project/[projectSlug].tsx` — projects dropdown, `MenuItem` per project navigates in place (`onClick={() => navigate(...)}`, lines 166-178). Polls `getSyncPending` every 2 s (lines 44-59). `currentProjectName()` helper exists (lines 61-65). Never touches `document.title`.
- `src/routes/index.tsx` — root redirect via `getDefaultProjectSlug()` (lastUsedProjectSlug, first project fallback inside `ProjectRegistry.getDefaultProjectSlug`).
- `src/components/project/project-api.ts` — `getDefaultProjectSlug`, `loadProjectPage` queries; `deleteProject` calls only `projectRegistry.removeProject` (does not stop the project's watcher — today that happened implicitly via the next `watchOnly`).
- `src/core/project/project-registry.ts` — `setLastUsed` ignores unknown projectSlugs; `removeProject` fixes up `lastUsedProjectSlug`.
- `electron/main.ts` — single `mainWindow` variable; `window-state.json` is a single `{width,height,x?,y?,maximized?}` object (`loadWindowState` swallows read errors and returns defaults — this is the migration entry point); `page-title-updated` is `preventDefault`ed (lines 85-87); `nativeTheme.on("updated")` targets `mainWindow`; `second-instance` focuses `mainWindow` (and relaunches when exe mtime changed); `window-all-closed` calls `serverHandle.shutdown()` (= `fileWatcher.stopAll()`), drains pending ops with a 5 s grace and a "Finishing sync..." window; `app.requestSingleInstanceLock`.
- `electron/server-adapter.ts` — imports the built server in-process; talks to services through `globalThis.__aiStagesServices` (a `ServiceContainer` set by `src/core/config/instances.ts`, so `projectRegistry` is already reachable without IPC). `ServerHandle` = `{ port, shutdown, waitForPendingOps }`.
- `e2e/fixtures.ts` — `setupE2E()` creates one server per suite and one `ctx.page` per test. `readProjectRegistry(server)` reads `config.json` from the sandboxed data dir. `createProject` seeds registry + repos; `withRemote: true` pushes the tickets branch upstream (so the pending badge starts hidden).
- `e2e/real-server.ts` — spawns the built server (`.output/server/index.mjs`) against `CONTEXT_LAUNCH_DATA_DIR`.
- `scripts/testid-coverage.ts` — every `data-testid` literal in `src/**/*.tsx` must be referenced from `e2e/**/*.test.ts` or `e2e/fixtures.ts`, else the gate fails.
- `vitest.config.ts` — unit project `unit-ts` includes `electron/**/*.test.ts`; e2e project includes `e2e/**/*.test.ts` with `fileParallelism: false`.
- `tsconfig.json` includes `src`, `e2e`, `scripts`, `electron` — `tsc --noEmit` covers everything.
- `src/components/ticket/ticket-detail-parts.tsx:280` — one `target="_blank"` link (image preview). Today Electron has no window-open handler, so it opens a default child window. This must keep working.
- Unit tests that will feel the change: `src/core/board/project-page-service.test.ts` (stubs `setLastUsed`, `watchOnly`; two tests assert lastUsed is not persisted), `src/core/infra/file-watcher.test.ts` (two `watchOnly` tests, lines ~661-723).
- CONTEXT.md already defines the glossary terms Project Window and Session Restore; no glossary change needed.

## Resistance points and resolutions

1. `ProjectPageService.loadProjectPage` performs two global side effects (`watchOnly`, `setLastUsed`) as part of a read. Loading project B silently breaks project A's window (watcher killed, badge freezes) and any background revalidation claims last-used. Resolution: delete both couplings at the source. Watching becomes additive (`watch`); last-used moves out of the page load entirely into a focus-driven, client-fired server call. No compatibility shim, no "current project" singleton.
2. `FileWatcher.watchOnly` exists only to serve the single-window assumption. Resolution: remove the method and its tests rather than routing around it. The stop-all-others mode ceases to exist (PRD decision). This opens a gap — project removal used to lose its watcher implicitly on the next `watchOnly` — closed explicitly: `deleteProject` stops that project's watcher. This is the right depth: the callee's contract ("watch this, kill the rest") was wrong, so the callee changes, not the callers.
3. `electron/main.ts` is built around one `mainWindow` and a single-object `window-state.json`. Every consumer (`second-instance`, theme updates, close persistence) reads the singleton. Resolution: a window registry (id-keyed map + ordered focus list + session entry list) replaces the variable; all consumers read the registry. The state file becomes an ordered entry list with migration on first read. All list mutations, migration, cascade and clamp math go into a pure module (`electron/window-bookkeeping.ts`) so the policy is unit-testable without Electron — this is the one new seam the PRD's Testing Decisions demand.
4. `main.ts` suppresses `page-title-updated`, so per-window titles are impossible. Resolution: remove the suppression; the renderer (project page) owns the title via `document.title` (PRD decision). The `BrowserWindow` constructor title remains the fallback for pages that never set one (add-project, root).
5. The dropdown rows are Ark UI `MenuItem`s whose select action navigates in place. A nested button inside a menu item will also trigger the row's select unless propagation is stopped. Resolution: keep row semantics untouched (PRD req 5) and stop propagation on the button's `pointerdown` and `click` events; the e2e test pins "opener URL unchanged" so a regression is caught at the behavior level.
6. The main process needs the Project Registry (restore must skip gone projects) but the PRD forbids IPC/preload. Resolution: no new channel is needed — the server already runs in-process and publishes `__aiStagesServices`; extend `electron/server-adapter.ts`'s `ServerHandle` with `listProjectSlugs()` read from the existing global, mirroring how `shutdown`/`waitForPendingOps` already work.
7. The e2e harness (`setupE2E`) drives exactly one page. Resolution: extend `E2EContext` with a tracked `newPage()` helper (auto-closed in `afterEach`) instead of ad-hoc page creation in tests.
8. `second-instance` focuses `mainWindow`. Resolution: it reads the focus-order list from the registry and focuses the most recently focused Project Window (PRD req 14). The exe-mtime relaunch path snapshots all windows before relaunching.
9. Quit-by-closing-everything would erase the whole session if every close persisted its removal. Resolution (PRD decision, req 9): the close mutation keeps the entry when it is the last remaining window; an explicit app quit (`before-quit` before windows closed, e.g. macOS Cmd+Q or the relaunch path) snapshots the full list first and a `quitting` flag makes subsequent per-window close handlers no-ops.

## Step 0 — Baseline

Run `npm run test:all` on a clean tree. It must be green before starting (repo rule: no pre-existing errors). If it is not, stop and fix first.

## Step 1 (seam, behavior-preserving) — Multi-page e2e harness

Files: `e2e/fixtures.ts` (modify).

Change:
- Extend `E2EContext` with `newPage(): Promise<Page>`.
- In `setupE2E`: keep a `const extraPages: Page[] = []` in the closure. `ctx.newPage = async () => { const p = await ctx.browser.newPage({ viewport }); extraPages.push(p); return p; }`. In `afterEach`, close all `extraPages` (and clear the array) in addition to `ctx.page`. Closing a page whose popups are still open: also close each page's popups — simplest is to close via `p.context().close()` for extra pages, since `browser.newPage()` gives each page its own context; document in the test (not code comments) nothing else.

Why: PRD Testing Decisions require one server and two Playwright pages; today the harness owns exactly one page and tests have no sanctioned way to get a second.

Acceptance:
- `npm run test:e2e` passes unchanged (no test uses `newPage` yet).
- `tsc --noEmit` clean.

## Step 2 (seam, behavior-preserving) — Pure window-bookkeeping module

Files: `electron/window-bookkeeping.ts` (create), `electron/window-bookkeeping.test.ts` (create).

This module must not import `electron`. Data in, data out; treat lists as immutable (return new arrays).

Types (data only):
```ts
export interface WindowBounds { x?: number; y?: number; width: number; height: number }
export interface WindowStateEntry { projectSlug: string | null; bounds: WindowBounds; maximized: boolean }
export interface SessionWindow { windowId: number; projectSlug: string | null; bounds: WindowBounds; maximized: boolean }
```
Constants: `DEFAULT_WINDOW_WIDTH = 1400`, `DEFAULT_WINDOW_HEIGHT = 900`, `CASCADE_STEP = 32` (fixed small step per PRD).

Functions:
- `migrateWindowState(raw: unknown): WindowStateEntry[]`
  - `null`/non-object/unparseable → `[]` (fresh-install path; not a silent fallback — absence of state is a defined state).
  - Object with a `windows` array → validate each element (`projectSlug` string or null, `bounds.width/height` finite numbers, `x/y` finite numbers or absent, `maximized` boolean); drop malformed elements.
  - Legacy single object (has numeric `width` and `height`, no `windows` key) → one entry `{ projectSlug: null, bounds: { x?, y?, width, height }, maximized: !!maximized }`. This seeds the single default window (PRD decision).
- `restoreEntries(entries: WindowStateEntry[], registeredProjectSlugs: ReadonlySet<string>, displayWorkAreas: WindowBounds[]): WindowStateEntry[]` — keep entries whose `projectSlug` is null or in the set (unavailable-on-disk projects ARE in the registry set, so they are kept — PRD req 10); clamp each entry's bounds via `clampToDisplays`.
- `clampToDisplays(bounds: WindowBounds, displayWorkAreas: WindowBounds[]): WindowBounds` — if `x`/`y` missing, clamp only `width`/`height` to the largest work area (position left to the OS/centering). Otherwise pick the work area with the largest intersection with `bounds` (fallback: the first work area — caller guarantees at least one display), clamp `width`/`height` to that work area, then clamp `x`/`y` so the whole rect lies inside it.
- `cascadeFrom(openerBounds: Required<WindowBounds>, workArea: WindowBounds): WindowBounds` — opener size, `x + CASCADE_STEP`, `y + CASCADE_STEP`, then clamp fully into `workArea` (same clamp math). Implements PRD req 13.
- Session-list mutations:
  - `addSessionWindow(list, w: SessionWindow): SessionWindow[]` (append).
  - `updateSessionWindow(list, windowId, patch: Partial<Omit<SessionWindow, "windowId">>): SessionWindow[]`.
  - `closeSessionWindow(list, windowId, finalBounds: WindowBounds, maximized: boolean): SessionWindow[]` — if more than one entry, remove the entry; if it is the only entry, keep it with `finalBounds`/`maximized` applied. This is the "final close does not persist its own removal" rule (PRD req 9).
- Focus order (most recent first): `recordFocus(order: number[], windowId): number[]`, `removeFromFocusOrder(order, windowId): number[]`, `mostRecentlyFocusedId(order: number[]): number | null`.
- `toWindowStateEntries(list: SessionWindow[]): WindowStateEntry[]` (strip `windowId`).
- `projectSlugFromUrl(url: string): string | null` — parse with `new URL(url)`, match pathname `^/project/([^/]+)$`, `decodeURIComponent` the capture; anything else (root, `/add-project`, unparseable) → null.

Unit tests (`electron/window-bookkeeping.test.ts`, runs in the `unit-ts` vitest project which already includes `electron/**/*.test.ts`):
- migrate: null → []; garbage string → []; legacy `{width,height}` → one null-projectSlug entry; legacy with x/y/maximized preserved; new list shape round-trips; malformed list elements dropped while valid ones survive.
- closeSessionWindow: removes among many; keeps the last one with updated bounds and maximized.
- add/update immutability (input array not mutated).
- recordFocus moves id to front, dedupes; removeFromFocusOrder; mostRecentlyFocusedId on empty → null.
- cascadeFrom: plain offset; wraps/clamps when opener is near the right/bottom edge; oversized opener clamped to work area.
- clampToDisplays: fully on-screen unchanged; off-screen bounds moved into the best display; larger-than-display shrunk; missing x/y only clamps size.
- restoreEntries: drops entries for gone projects, keeps null-projectSlug entries, keeps entries for registered-but-unavailable projects, clamps bounds.
- projectSlugFromUrl: `http://127.0.0.1:1234/project/my-proj` → `my-proj`; root and `/add-project` → null; encoded projectSlug decoded; `/project/a/b` → null.

Why: PRD Testing Decisions name this exact seam; main.ts (Step 7) becomes thin event wiring.

Acceptance:
- `vitest run electron/window-bookkeeping.test.ts` green; `tsc --noEmit`, `eslint .` clean.
- Module has no `electron` import.

## Step 3 (seam, behavior-preserving) — Expose registry projectSlugs to the main process

Files: `electron/server-adapter.ts` (modify).

Change:
- Extend the local `ServiceGlobal` interface with `projectRegistry: { listProjects(): { projectSlug: string }[] }` (structural subset of the real `ServiceContainer` global that `src/core/config/instances.ts` publishes).
- Extend `ServerHandle` with `listProjectSlugs: () => string[]`, implemented as `g.__aiStagesServices?.projectRegistry.listProjects().map((p) => p.projectSlug) ?? []` (matches the existing optional-chaining style of `shutdown`/`waitForPendingOps`).

Why: Session Restore must skip entries whose project is gone from the Project Registry (PRD req 10) and the PRD forbids IPC/preload; the in-process global is the existing no-IPC channel.

Acceptance: `tsc --noEmit` clean; `npm run electron:build-main` succeeds; existing `electron/server-adapter.test.ts` still green.

## Step 4 (implementation) — Additive file watching

Files: `src/core/infra/file-watcher.ts`, `src/core/board/project-page-service.ts`, `src/components/project/project-api.ts`, `src/core/infra/file-watcher.test.ts`, `src/core/board/project-page-service.test.ts` (modify), `e2e/project-window.test.ts` (create).

Changes:
1. `file-watcher.ts`: delete the `watchOnly` method entirely. `watch` (already idempotent per dir), `stop`, `stopAll` remain.
2. `project-page-service.ts` line 44: `this.fileWatcher.watchOnly(worktreeDir)` → `this.fileWatcher.watch(worktreeDir)`.
3. `project-api.ts` `deleteProject`: watchers stop on project removal (PRD decision). Before removal, resolve the dir; after successful removal, stop the watcher:
```ts
const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
projectRegistry.removeProject(projectSlug);
fileWatcher.stop(worktreeDir);
```
`fileWatcher` is added to the existing import from `~/core/config/instances.js`; `worktreeManager` is already imported. `getWorktreeDir` must be read before `removeProject` because its resolver consults the registry's `ticketsPath`. `FileWatcher.stop` on an unwatched dir is already a no-op.
4. `file-watcher.test.ts`: replace the two `watchOnly` tests (~lines 661-723):
   - "watchOnly for the same dir keeps the watcher alive..." → same scenario via `watch(dir)` called twice (second call must not recreate the watcher; the pending debounce commit still fires).
   - "watchOnly stops watchers for other directories" → inverted: "watch is additive: watching a second directory keeps the first watcher active" (touch a file in dir A after watching B; A still auto-commits).
5. `project-page-service.test.ts`: change the stub to `{ watch: vi.fn() }`; add an assertion in a loaded-page test that `fileWatcher.watch` was called with the worktree dir. (The two lastUsed tests are handled in Step 5 — if executing steps in order, leave them for now; they still pass since `setLastUsed` is untouched until Step 5. If more convenient, do Steps 4 and 5 as one commit.)
6. `e2e/project-window.test.ts` (new suite, `setupE2E()` harness) — first test, the liveness pin from PRD Testing Decisions:
   - `createProject(ctx.testServer, { projectSlug: uniqueSlug("pw-live-a"), withRemote: true })` (withRemote pushes the tickets branch, so the pending badge starts hidden) and a second plain project `pw-live-b`.
   - `gotoProject(ctx.page, ..., a.projectSlug)`; assert `[data-testid="sync-button-pending-badge"]` count is 0 after a ~2.5 s wait (first poll cached).
   - `const page2 = await ctx.newPage(); await gotoProject(page2, ctx.testServer, b.projectSlug);` — project B is now the project loaded last.
   - `fs.writeFileSync(path.join(a.ticketsPath, "external-note.md"), "external change")`.
   - Assert on page 1: `sync-button-pending-badge` becomes visible (timeout 20000 — covers 2 s watcher debounce + 2 s poll).
   - Assert the real disk side effect: poll (up to ~15 s) `git log -1 --format=%s` in `a.ticketsPath` until it equals `auto: external changes`.
   - This test fails on the pre-change code (B's `watchOnly` killed A's watcher, so A's cache never invalidates) and passes after.

Why: PRD req 6 / decision "File watching becomes additive"; the removal gap is closed at `deleteProject` because that is the app-level project-removal operation.

Acceptance:
- `grep -r watchOnly src/ e2e/ electron/` → no hits.
- `npm run test` (tsc + eslint + unit) green; new e2e test green via `npm run test:e2e`.
- Existing `e2e/delete-project.test.ts` still green.

## Step 5 (implementation) — Last-used means last-focused

Files: `src/core/board/project-page-service.ts`, `src/components/project/project-api.ts`, `src/routes/project/[projectSlug].tsx`, `src/core/board/project-page-service.test.ts` (modify), `e2e/project-window.test.ts` (extend).

Changes:
1. `project-page-service.ts`: delete line 38 (`this.projectRegistry.setLastUsed(projectSlug);`). `loadProjectPage` becomes a pure read (plus watch + finalizeResolution which stay).
2. `project-api.ts`: add a fire-and-forget server function (per the data-access rules — plain `"use server"`, no `action()`, no return payload consumed):
```ts
export async function recordProjectFocus(projectSlug: string) {
  "use server";
  projectRegistry.setLastUsed(projectSlug);
}
```
`setLastUsed` already ignores projectSlugs not in the registry, so a stale window cannot corrupt the value.
3. `[projectSlug].tsx`:
   - Import `recordProjectFocus`.
   - Track the last reported projectSlug in a plain `let lastReportedProjectSlug: string | null = null;` inside the component.
   - `createEffect`: when `data()?.status === 'loaded'` and `data()!.projectSlug !== lastReportedProjectSlug`, set the tracker and `void recordProjectFocus(data()!.projectSlug)`. This fires once per project load (initial load and in-place navigation), not on every revalidation — exactly the PRD wording "on initial project load", and it preserves the old guarantee that not-found/unavailable projects never claim last-used (previously enforced inside `loadProjectPage`, now enforced by the loaded-status guard).
   - `onMount`: add a `window.addEventListener("focus", handler)` with `onCleanup` removal; handler fires `void recordProjectFocus(...)` only when current `data()?.status === 'loaded'` (PRD: "and on window focus", req 12).
4. `project-page-service.test.ts`: remove `setLastUsed` from the registry stub and delete the two tests "does not persist lastUsed for a known-but-unavailable project" / "for a not-found project" — the invariant moved to the client guard and is now pinned by the e2e test below. Keep their status assertions by folding them into two slim tests that only assert `result.status` (`'unavailable'`, `'not-found'`).
5. `e2e/project-window.test.ts`, new test "focusing a window makes its project the last-used":
   - Projects F and G; `gotoProject(ctx.page, F)`; `page2 = ctx.newPage()`; `gotoProject(page2, G)`.
   - Poll `readProjectRegistry(ctx.testServer).lastUsedProjectSlug` until `G` (load path works).
   - `await ctx.page.bringToFront(); await ctx.page.evaluate(() => window.dispatchEvent(new Event("focus")));` (bringToFront for realism, the dispatched event for determinism in headless — it exercises the real listener, server call, and registry write; nothing app-owned is stubbed).
   - Poll registry until `lastUsedProjectSlug === F`; assert.

Why: PRD decision "The lastUsedProjectSlug write moves out of the project page load"; req 12.

Acceptance:
- `grep setLastUsed src/core/board/` → no hits.
- Root redirect behavior unchanged: existing e2e suites (e.g. `picker-buttons`, `legacy-config`) still green — note `createProject` seeds `lastUsedProjectSlug` directly and `gotoProject` now also records focus on load, so last-used still ends up on the visited project.
- `npm run test` and `npm run test:e2e` green.

## Step 6 (implementation) — Open-in-new-window button and window title

Files: `src/routes/project/[projectSlug].tsx` (modify), `e2e/project-window.test.ts` (extend), optionally `e2e/fixtures.ts` if a shared helper is useful.

Changes:
1. Dropdown row (lines 166-178): restructure each project `MenuItem` to a flex row with the name and an always-visible icon button:
```tsx
<MenuItem
  value={`project-${project.projectSlug}`}
  disabled={!project.available}
  class={`flex items-center justify-between gap-2 ${project.projectSlug === d().projectSlug ? "font-semibold" : ""}`}
  onClick={() => navigate(`/project/${project.projectSlug}`)}
  data-testid="project-header-project-item"
>
  <span>{project.name}</span>
  <button
    class="btn-icon"
    disabled={!project.available}
    title="Open in new window"
    data-testid="project-header-open-window-button"
    onPointerDown={(e) => { e.stopPropagation(); }}
    onClick={(e) => {
      e.stopPropagation();
      window.open(`/project/${project.projectSlug}`, project.projectSlug);
    }}
  >
    {square-and-arrow SVG, 14x14, stroke currentColor — same inline-SVG style as the sync/settings icons (external-link shape: box with arrow out of the top-right corner)}
  </button>
</MenuItem>
```
   - This IS the whole window-opening seam (PRD decision): project page URL as `window.open` url, projectSlug as the target name. No mode detection, no helper indirection needed — one call, both runtimes.
   - `stopPropagation` on `pointerdown` and `click` keeps Ark's item-select (and the row's navigate) from firing (resistance 5). Plain row click behavior is untouched (req 5).
   - Button disabled exactly when the row is (`!project.available`, req 3). Always rendered (req 1).
2. Title (req 7 + PRD decision "The project page sets the document title from the project name"): add
```tsx
createEffect(() => {
  const name = currentProjectName();
  if (name) document.title = `${name} - Context & Launch`;
});
```
inside the component (runs client-side only; effects do not run during SSR).
3. e2e (`e2e/project-window.test.ts`), one test covering PRD Testing Decision bullet 3 plus title plus reuse:
   - Projects C and D; `gotoProject(ctx.page, C)`. Assert `await ctx.page.title()` contains C's name.
   - Open the dropdown (`project-header-project-dropdown-trigger`), locate D's row: `ctx.page.locator('[data-testid="project-header-project-item"]', { hasText: d.projectSlug })`, then its `[data-testid="project-header-open-window-button"]`.
   - `const [popup] = await Promise.all([ctx.page.waitForEvent("popup"), button.click()]);`
   - Assert popup URL ends `/project/${d.projectSlug}`; wait for its board (`[data-testid="project-header-settings-button"]`); assert popup title contains D's name; assert opener URL is still `/project/${c.projectSlug}` (this also proves propagation-stopping works).
   - Record `pagesBefore = ctx.page.context().pages().length`. Reopen the dropdown, click D's button again, wait ~1 s: assert `ctx.page.context().pages().length === pagesBefore` (named target reused, no duplicate) and popup URL still `/project/${d.projectSlug}`.
   - Close the popup at the end of the test.
   - Separate small test for req 3: create project E, then append a dead registry entry directly (`fs` read/modify/write of `config.json` in `ctx.testServer.dataDir`: push `{ path: path.join(ctx.testServer.reposParentDir, "missing-gone"), projectSlug: "gone-x", branch: "tickets" }`); `gotoProject(E)`; open dropdown; assert the `gone-x` row's open-window button `toBeDisabled()`.

Why: PRD reqs 1-5, 7; decisions 1, 11.

Acceptance:
- `npm run test:gate` passes (new testid `project-header-open-window-button` referenced from e2e).
- New e2e tests green; `project-header.test.ts` untouched and green (row navigation preserved).
- `npm run test:all` green.

## Step 7 (implementation) — Electron multi-window: registry, popup interception, Session Restore

Files: `electron/main.ts` (rewrite the window management; keep server startup, single-instance lock, relaunch-on-update, pending-ops drain intact), using `electron/window-bookkeeping.ts` (Step 2) and `listProjectSlugs` (Step 3).

Module-level state (replaces `mainWindow`):
```ts
const windowsById = new Map<number, BrowserWindow>();
let sessionWindows: SessionWindow[] = [];
let focusOrder: number[] = [];
let quitting = false;
let serverHandle: ServerHandle | null = null;
```
`writeWindowState()` — `fs.writeFileSync(windowStateFile, JSON.stringify({ windows: toWindowStateEntries(sessionWindows) }))`.
`currentBounds(win)` — `{ bounds: win.isMaximized() ? win.getNormalBounds() : win.getBounds(), maximized: win.isMaximized() }` (same rule as today's `saveWindowState`).
`snapshotAllWindows()` — for each live window, `updateSessionWindow` with `currentBounds`; then `writeWindowState()`.

`createProjectWindow({ url, bounds, maximized })`:
- `new BrowserWindow({...})` with the same options as today (title `Context & Launch v${app.getVersion()}`, themed `backgroundColor`, `autoHideMenuBar`, `show: false`, icon, same `webPreferences`) plus `x/y/width/height` from `bounds` (x/y possibly undefined → OS placement).
- Register: `windowsById.set(win.id, win)`; `sessionWindows = addSessionWindow(sessionWindows, { windowId: win.id, projectSlug: projectSlugFromUrl(url), bounds, maximized })`; `focusOrder = recordFocus(focusOrder, win.id)`; `writeWindowState()`.
- Events:
  - `win.on("focus")` → `focusOrder = recordFocus(focusOrder, win.id)`.
  - `win.webContents.on("did-navigate")` and `("did-navigate-in-page")` → `sessionWindows = updateSessionWindow(sessionWindows, win.id, { projectSlug: projectSlugFromUrl(navigatedUrl) }); writeWindowState();` — this is how the main process "learns each window's project by observing in-page navigation" (PRD decision).
  - `win.on("close")` → `if (quitting) return;` else `sessionWindows = closeSessionWindow(sessionWindows, win.id, ...currentBounds(win)); writeWindowState();` — non-final closes persist removal, the final close keeps its entry (req 9).
  - `win.on("closed")` → `windowsById.delete(win.id); focusOrder = removeFromFocusOrder(focusOrder, win.id);`.
  - `win.webContents.setWindowOpenHandler(({ url }) => handleWindowOpen(win, url))`.
- NO `page-title-updated` preventDefault — delete that block so the document title (set by the project page in Step 6) becomes the window title (req 7).
- `if (maximized) win.maximize();` then `win.loadURL(url).then(() => win.show()).catch((err) => console.error("Project Window failed to load:", err));` — do not swallow load errors.

`handleWindowOpen(opener, url)`:
- `const targetProjectSlug = projectSlugFromUrl(url);`
- If `targetProjectSlug === null` → `return { action: "allow" };` — preserves today's default-window behavior for the image-preview `target="_blank"` link and any non-project popup; those windows are not Project Windows and are not tracked.
- Existing window: walk `focusOrder` for the first id whose session entry has `projectSlug === targetProjectSlug` (most recently focused duplicate wins, PRD decision 10); if found: `if (w.isMinimized()) w.restore(); w.focus(); return { action: "deny" };` (req 4).
- Else: `const workArea = screen.getDisplayMatching(opener.getBounds()).workArea;` `const bounds = cascadeFrom(opener.getBounds(), workArea);` `createProjectWindow({ url, bounds, maximized: false }); return { action: "deny" };` (req 2, 13; PRD decision 2 — popup denied, real window created).

`app.on("ready")`:
- Start the server as today.
- Read state: `let raw: unknown = null; try { raw = JSON.parse(fs.readFileSync(windowStateFile, "utf-8")); } catch { raw = null; }` (missing/corrupt file is the defined fresh state, same tolerance as today's `loadWindowState`); `let entries = migrateWindowState(raw);`
- `entries = restoreEntries(entries, new Set(serverHandle.listProjectSlugs()), screen.getAllDisplays().map((d) => d.workArea));` (req 10: gone projects skipped, unavailable ones kept — `listProjectSlugs` reflects registry membership, not disk availability; bounds clamped).
- If `entries.length === 0` → `entries = [{ projectSlug: null, bounds: { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }, maximized: false }]` (req 11: fresh start opens one window on the root URL → last-used redirect).
- For each entry, `createProjectWindow({ url: entry.projectSlug ? `${base}/project/${encodeURIComponent(entry.projectSlug)}` : base, bounds: entry.bounds, maximized: entry.maximized })` where `base = http://127.0.0.1:${port}` (sequential loop, awaiting each `loadURL` like today is fine).
- `createProjectWindow` already wrote the list shape — the legacy object is thereby replaced on first run (PRD decision 6).
- `nativeTheme.on("updated")` → iterate `windowsById` values, `setBackgroundColor` on each non-destroyed window.

`app.on("second-instance")`:
- Exe mtime changed → `snapshotAllWindows(); quitting = true; app.relaunch(); app.exit(0);` (whole session survives the update relaunch).
- Else focus the most recently focused Project Window: `const id = mostRecentlyFocusedId(focusOrder); const w = id === null ? null : windowsById.get(id);` restore-if-minimized + focus (req 14).

`app.on("before-quit")`:
- `if (!quitting && windowsById.size > 0) { snapshotAllWindows(); } quitting = true;` — an explicit quit (macOS Cmd+Q) persists the full multi-window session before windows close; when quit is reached via window-all-closed the map is already empty and nothing is rewritten, leaving the req-9 semantics intact.

`app.on("window-all-closed")`: byte-for-byte the existing logic (shutdown → `stopAll`, pending-ops race with 5 s grace, "Finishing sync..." window, quit) — req 15 explicitly freezes this. The sync window is created directly with `new BrowserWindow` and never registered in the bookkeeping (it is not a Project Window).

Delete: `WindowState` interface, `loadWindowState`, `saveWindowState`, the `mainWindow` variable, the `page-title-updated` handler.

Why: PRD decisions 2, 6, 7, 8, 9; reqs 2, 4, 8-11, 13-15.

Acceptance:
- `npm run electron:build-main` succeeds; `tsc --noEmit`, `eslint .` clean.
- All bookkeeping policy is in the pure module; `main.ts` contains only Electron event wiring (no list arithmetic, no migration parsing, no cascade math inline).
- Unit tests from Step 2 cover every branch main.ts relies on (close-keeps-last, migration, clamp, cascade, focus order, URL parsing).
- Manual smoke (desktop, optional but recommended): `npm run build && npm run electron:build-main && npm run electron:start` — open a second project via the dropdown button (cascaded window, own title), click the button again (focuses, no duplicate), close one window, quit, relaunch (restored windows), verify an old single-object `window-state.json` migrates.

## Step 8 — Full gate and review

- `npm run test:all` — everything green, no skipped e2e.
- `grep -rn "watchOnly" .` (excluding node_modules/.output) → empty.
- `grep -n "setLastUsed" src/core/board/project-page-service.ts` → empty.
- Re-read the PRD requirement list 1-15 against the diff; each maps to: 1-5 → Step 6, 6 → Step 4, 7 → Steps 6+7, 8-11 → Step 7, 12 → Step 5, 13-14 → Step 7, 15 → Step 7 (unchanged handler).
- Commit per step with plain messages, no Co-Authored-By, never push.

## Out of scope (from PRD — do not build)

- Session Restore for browser app mode.
- IPC or preload infrastructure.
- Enforcing one window per project on plain in-place navigation (duplicates are harmless: per-request server, additive watchers, independent polling; the button focuses the most recently focused duplicate).
- Per-window last-used tracking.

## New/modified file inventory

Create:
- `electron/window-bookkeeping.ts` — pure window bookkeeping module.
- `electron/window-bookkeeping.test.ts` — its unit tests.
- `e2e/project-window.test.ts` — liveness, popup/reuse/title, disabled button, focus-updates-last-used.

Modify:
- `e2e/fixtures.ts` — `E2EContext.newPage()`.
- `electron/server-adapter.ts` — `ServerHandle.listProjectSlugs()`.
- `src/core/infra/file-watcher.ts` — remove `watchOnly`.
- `src/core/infra/file-watcher.test.ts` — rework the two `watchOnly` tests to additive semantics.
- `src/core/board/project-page-service.ts` — `watch()` instead of `watchOnly()`, drop `setLastUsed`.
- `src/core/board/project-page-service.test.ts` — stub/tests updated.
- `src/components/project/project-api.ts` — `recordProjectFocus`; `deleteProject` stops the project's watcher.
- `src/routes/project/[projectSlug].tsx` — open-in-new-window button, `document.title` effect, focus/load `recordProjectFocus` wiring.
- `electron/main.ts` — window registry, popup interception, Session Restore, list-shaped `window-state.json` with migration, multi-window second-instance/theme/quit handling.

Unchanged on purpose:
- `src/routes/index.tsx` — root redirect stays the sole consumer of `lastUsedProjectSlug`.
- `electron/main.ts` `window-all-closed` drain logic — req 15.
- `CONTEXT.md` — Project Window and Session Restore are already defined.
