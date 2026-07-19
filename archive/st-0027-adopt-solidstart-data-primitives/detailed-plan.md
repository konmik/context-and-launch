# ST-0027 Detailed Implementation Plan

## Pre-requisites

Before starting, verify:
- Branch `st-0027-adopt-solidstart-data-primitives` is checked out
- `npm run test:all` passes on current main (all green baseline)
- Node >= 20 is installed

## Migration Order

The migration has six phases. Each phase ends with `npm run test:all` passing.

Phase 0: Preparatory renames and error cleanup
Phase 1: Rename `src/server/` to `src/core/`
Phase 2: Create colocated server function files (`*-api.ts`)
Phase 3: Migrate components to use query/action/createAsync
Phase 4: Delete API routes, controllers, and lib wrappers
Phase 5: Update CLAUDE.md, delete tests, final validation

---

## Phase 0: Error Class Cleanup

### Step 0.1: Remove statusCode from AppError and delete PayloadError

Files to modify:
- `src/server/shared/errors.ts`

Changes:
- Remove the `statusCode` parameter from `AppError` constructor. Make it `class AppError extends Error { constructor(message: string) { super(message); } }`
- Change `ValidationError` to `class ValidationError extends AppError { constructor(message: string) { super(message); } }`
- Change `NotFoundError` to `class NotFoundError extends AppError { constructor(message: string) { super(message); } }`
- Delete the `PayloadError` class entirely
- `ProcessError`, `ErrorInfo`, `errorMessage`, `errorPayload` remain unchanged

Files to modify for PayloadError removal:
- `src/server/shared/route-helpers.ts` -- The `errorResponse` function references `PayloadError` and `e.statusCode`. These references become dead code in Phase 4 when route-helpers.ts is deleted, but for now keep `errorResponse` working by: replacing the PayloadError check with a plain JSON error response using status 500, and replacing `e.statusCode` references with 500 (since routes still exist in this phase).
- `src/server/launcher/agent-launch.ts` -- The `resolveLaunchDir` function throws `PayloadError` for dirtyWorktree and behindRemote. Change these to return discriminated result objects instead of throwing. Return type becomes `Promise<string | { dirtyWorktree: true; message: string } | { behindRemote: true; message: string }>`. Callers (the API route ai/run.ts and ai/pull-and-retry.ts) must be updated to check the return value instead of catching PayloadError.

Files to modify:
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/ai/run.ts` -- Handle the discriminated return from `resolveLaunchDir`
- `src/server/shared/errors.test.ts` -- No changes needed (only tests `errorMessage`)

Acceptance criteria:
- `PayloadError` no longer exists in the codebase
- `AppError`, `ValidationError`, `NotFoundError` have no `statusCode` property
- `npm run test:all` passes

---

## Phase 1: Rename src/server/ to src/core/

### Step 1.1: Rename the directory

Use git mv:
```
git mv src/server src/core
```

### Step 1.2: Update all import paths

There are 220 occurrences of `~/server/` across 106 files. Every one must change to `~/core/`.

Files to update (all files containing `from "~/server/` or `import ... "~/server/`):
- All files under `src/core/` (internal references like `../config/` are relative, so they do NOT change. Only files that use `~/server/` tilde imports change)
- `src/server/actions.ts` becomes `src/core/actions.ts` -- its own imports use `~/server/` so update to `~/core/`
- All files under `src/routes/api/` (about 40 files)
- All files under `src/components/` that import types from `~/server/`
- All files under `src/lib/` that import from `~/server/`
- `src/routes/index.tsx`, `src/routes/add-project.tsx`, `src/routes/project/[projectSlug].tsx`

The `src/core/actions.ts` file also re-exports types: `export type { BoardState, ProjectPageData } from "~/server/board/board-types.js"` must become `~/core/board/board-types.js`.

Additionally, files within `src/core/` that use `~/server/` tilde imports (like `src/core/shared/route-helpers.ts` which has `import { worktreeManager } from "~/server/config/instances.js"`) must update to `~/core/config/instances.js`.

### Step 1.3: Update the middleware logger

`src/middleware.ts` logs paths starting with `/api/`. This file does not import from `~/server/` so no changes needed, but it will become irrelevant after API routes are deleted (Phase 4).

Acceptance criteria:
- `src/server/` directory no longer exists
- `src/core/` contains all the same files
- No import path contains `~/server/`
- `npm run test:all` passes

---

## Phase 2: Create Colocated Server Function Files

This phase creates the new `*-api.ts` files that contain `query()` and `action()` definitions with `"use server"` directives. The server functions call `src/core/` stores and managers directly.

### Step 2.1: Create src/components/project/project-api.ts

This file replaces `src/core/actions.ts` and absorbs logic from multiple lib files and API routes.

Contents (server functions):
- `getDefaultProjectSlug` -- query, calls `projectRegistry.getDefaultProjectSlug()` (moved from `src/core/actions.ts`)
- `loadProjectPage` -- query, calls `projectPageService.loadProjectPage(projectSlug)` (moved from `src/core/actions.ts`)
- `addProject` -- action, calls projectRegistry/worktreeManager logic currently in `src/routes/api/projects.ts` POST handler. Returns `{ ok: true, projectSlug } | { ok: false, type: "validation", message: string }`
- `deleteProject` -- action, calls `projectRegistry.removeProject()`. Returns `{ ok: true } | { ok: false, type: "error", message: string }`
- `previewProjectPath` -- query, calls `projectRegistry.previewSlug()` and `detectMainBranch()` (from GET handler in `src/routes/api/projects.ts`)
- `pickDirectory` -- action (or plain server function), wraps the platform picker logic currently in `src/routes/api/pick-directory.ts`.
- `setProjectName` -- action, calls `projectRegistry.setName()`. Returns `{ ok: true } | { ok: false, type: "error", message: string }`
- `setBoardId` -- action, calls `projectRegistry.setBoardId()`. Returns discriminated result.

Re-export types:
- `export type { BoardState, ProjectPageData } from "~/core/board/board-types.js"`

Revalidation keys: `"default-project-slug"`, `"project-page"`

### Step 2.2: Create src/components/board/board-api.ts

Contains server functions for board definition CRUD:
- `listBoards` -- query, calls `boardConfigManager.listBoards()`. Key: `"boards"`
- `createBoard` -- action, calls `boardConfigManager.createBoard()`. Returns `{ ok: true, id: string } | { ok: false, type: "error", message: string }`
- `deleteBoard` -- action, calls `boardConfigManager.deleteBoard()` and `cascadeClearBoardId()`. Revalidates `"boards"`.
- `renameBoard` -- action
- `addColumn` -- action
- `updateColumn` -- action
- `deleteColumn` -- action
- `renameColumn` -- action (absorbs the column-rename-migration logic)
- `reorderColumns` -- action

### Step 2.3: Create src/components/ticket/ticket-api.ts

Contains server functions for ticket CRUD, context, files, references:
- `createTicket` -- action
- `updateTicket` -- action, returns `{ ok: true, folderName: string } | { ok: false, type: "error", message: string }`
- `deleteTicket` -- action
- `archiveTicket` -- action
- `reorderTicket` -- action
- `getContext` -- query (or plain server function since each call is for a specific file)
- `saveContext` -- action
- `deleteContext` -- action
- `getFileContent` -- plain server function (returns binary data; query is not appropriate for binary). This may need to remain as an API route if SolidStart server functions cannot return raw binary Response objects. If so, keep `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/files/[fileName].ts` as the sole surviving API route.
- `deleteFile` -- action
- `uploadFile` -- action with FormData parameter
- `addReferences` -- action
- `removeReference` -- action
- `getReferencedFileContent` -- same binary concern as getFileContent above
- `setUseWorktree` -- action
- `syncTickets` -- action (POST and DELETE variants for sync/abort)
- `getSyncPending` -- query, key: `"sync-pending"`. Calls `syncPendingTracker.hasPendingChanges()`

Edge case: Binary file serving (images, arbitrary files) via `getFileContent` and `getReferencedFileContent`. SolidStart server functions serialize return values as JSON. Binary data cannot be returned through `query()`. Two options:
  - Option A: Keep two API routes for binary file serving (`files/[fileName].ts` and `references/content.ts`). The component continues to use the URL directly for `<img src=...>` and fetch-based text loading.
  - Option B: Return base64 from the server function and decode on the client. This is wasteful for images.
  - Decision: Use Option A. Keep the two binary-serving API routes. Everything else migrates to server functions.

### Step 2.4: Create src/components/launcher/launcher-api.ts

Contains server functions for launcher settings, launcher config CRUD:
- `getMergedLauncherConfig` -- query, key: `"launcher-config"`. Calls `launcherConfigManager.getMergedConfig()` plus `projectRegistry.getBoardId()` and `projectRegistry.getName()`
- `saveColumnDefaults` -- action
- `saveProjectName` -- action
- `saveWorktreeRootPath` -- action
- `saveConflictResolution` -- action
- All item CRUD actions: `addTemplate`, `updateTemplate`, `deleteTemplate`, `addSkill`, `updateSkill`, `deleteSkill`, `reorderSkill`, `addProfile`, `updateProfile`, `deleteProfile`, `addShortcut`, `updateShortcut`, `deleteShortcut`
- `getLastUsedProfile` -- query, key: `"last-used-profile"`
- `saveLastUsedProfile` -- action
- `launchAgent` -- action, returns `{ ok: true } | { ok: false, type: "behindRemote", message: string } | { ok: false, type: "dirtyWorktree", message: string } | { ok: false, type: "error", message: string }`
- `pullAndRetryLaunch` -- action, returns same discriminated union
- `runShortcut` -- action, returns `{ ok: true } | { ok: false, type: "dirtyWorktree", message: string } | { ok: false, type: "error", message: string }`
- `resolveConflicts` -- action
- `abortRebase` -- action
- `worktreeCleanup` -- action

### Step 2.5: Create src/components/shared/shared-api.ts

Contains:
- `openConfigDir` -- plain "use server" function (fire-and-forget). No `action()` wrapper.
- `openNativeFileBrowser` -- action (wraps `openFileDialog` from `native-file-dialog.ts`). Returns `{ ok: true, paths: string[] } | { ok: false, type: "error", message: string }`

### Acceptance criteria for Phase 2:
- All `*-api.ts` files exist and compile
- Each server function has `"use server"` directive
- Queries use `query()` from `@solidjs/router`
- Mutations use `action()` from `@solidjs/router`
- Fire-and-forget functions are plain `"use server"` functions
- Mutation results are typed discriminated unions with `ok: boolean`
- `tsc --noEmit` passes (no type errors)
- Existing functionality still works via the old routes (new files are created but not yet consumed)

---

## Phase 3: Migrate Components to Use New Server Functions

This is the largest phase. Each step migrates one feature area. Within each step, the component switches from fetch-based controllers to createAsync/useSubmission patterns.

### Step 3.1: Migrate project page route (src/routes/project/[projectSlug].tsx)

Changes:
- Import `loadProjectPage`, `getDefaultProjectSlug` from `~/components/project/project-api.js` instead of `~/core/actions.js`
- Import `addProject` action from `~/components/project/project-api.js` instead of `~/lib/add-project.js`
- The `route.load` and `createAsync` calls already use `loadProjectPage` -- just change the import source
- Replace `addProjectAction` usage with the new `addProject` action

### Step 3.2: Migrate index route (src/routes/index.tsx)

Changes:
- Import from `~/components/project/project-api.js` instead of `~/core/actions`

### Step 3.3: Migrate add-project route (src/routes/add-project.tsx)

Changes:
- Import `addProject` from `~/components/project/project-api.js` instead of `~/lib/add-project.js`

### Step 3.4: Collapse project-page-controller into [projectSlug].tsx

The `createProjectPageController` currently has ~30 fetch calls. These all become `action()` calls via `useSubmission`.

Changes to `src/components/project/project-page-controller.ts`:
- Remove import of `apiFetch` from `~/lib/api.js`
- Remove import of `deleteProjectAction` from `~/lib/delete-project.js`
- Import action functions from `~/components/project/project-api.js` and `~/components/ticket/ticket-api.js`
- Replace each `fetch()/apiFetch()` call with the corresponding action call
- Change return types to use the discriminated union results
- Keep all the dialog state management (signals for open/close)

The sync-pending poller changes:
- Replace `createSyncPendingPoller` with a `createAsync` that calls the `getSyncPending` query
- Use `setInterval` + `revalidate("sync-pending")` for polling

### Step 3.5: Migrate AddProjectForm / add-project-controller

Changes to `src/components/project/add-project-controller.ts`:
- Replace `fetch('/api/projects?previewPath=...')` with call to `previewProjectPath` query from `project-api.ts`
- Replace `fetch('/api/pick-directory?path=...')` with call to `pickDirectory` from `shared-api.ts`
- The `deps.action` prop changes -- `AddProjectForm` should accept the `addProject` action directly instead of `addProjectAction`

### Step 3.6: Migrate ticket-detail-state

This is the most complex migration. `ticket-detail-state.ts` has ~15 fetch calls.

Changes to `src/components/ticket/ticket-detail-state.ts`:
- Remove all `fetch()` calls
- Import server functions from `ticket-api.ts` and `launcher-api.ts`
- `persistWorktree` -- call `setUseWorktree` action
- `loadTextContent` / context loading -- call `getContext` server function
- `launcherConfig` loading effect -- call `getMergedLauncherConfig` query via `createAsync`
- `patchColumnDefaults` -- call `saveColumnDefaults` action
- `saveFileContent` -- call `saveContext` action
- `deleteOrRemoveFile` -- call `deleteContext` / `deleteFile` / `removeReference` actions
- `openNativeFileBrowser` -- call `openNativeFileBrowser` from `shared-api.ts`
- `handleReferencesSelected` -- call `addReferences` action
- Remove `setError` manual plumbing where possible (let ErrorBoundary catch query errors)
- For mutation errors, check the discriminated `result.ok` and set error accordingly

Note: The `loadTextContent` pattern and image URL pattern for binary files must continue using direct URLs for `<img>` tags. Text content loading via context API can use server functions since it returns JSON.

Changes to `src/components/ticket/ticket-detail-upload.ts`:
- Replace `fetch(deps.ticketUrl("files/upload"), ...)` with call to `uploadFile` action
- The upload action receives FormData

Changes to `src/components/ticket/ticket-detail-header.ts`:
- Replace `apiFetch(...)` with call to `updateTicket` action from `ticket-api.ts`
- Remove import of `apiFetch`

Changes to `src/components/ticket/ticket-detail-shortcuts.ts`:
- Replace `fetch(deps.ticketUrl("shortcut/run"), ...)` with call to `runShortcut` action from `launcher-api.ts`
- Handle the discriminated result for dirtyWorktree

### Step 3.7: Migrate launcher-settings-state

`launcher-settings-state.ts` has ~20 fetch calls.

Changes to `src/components/launcher/launcher-settings-state.ts`:
- Remove all `fetch()` calls
- Import from `launcher-api.ts` and `board-api.ts`
- `loadConfig` -- call `getMergedLauncherConfig` via createAsync or direct server function call
- `loadBoards` -- call `listBoards` query
- `submitForm` -- call the appropriate item add/update action
- `deleteItem` -- call the appropriate item delete action
- `putField` generic helper -- replaced by individual action calls
- All board CRUD calls (`handleCreateBoard`, `handleDeleteBoard`, `handleSaveColumn`, etc.) -- call board-api.ts actions
- `saveSkillOrder` -- call `reorderSkill` action
- `saveProjectName`, `saveWorktreeRootPath`, `saveConflictResolution` -- call respective actions
- `handleBoardIdChange` -- call `setBoardId` action

### Step 3.8: Migrate agent-launcher-controller

Changes to `src/components/launcher/agent-launcher-controller.ts`:
- Replace `fetch(url, ...)` in `launchAgent` and `pullAndRetry` with calls to `launchAgent` and `pullAndRetryLaunch` actions from `launcher-api.ts`
- Handle discriminated results: check `result.ok` and `result.type` for behindRemote/dirtyWorktree/error

### Step 3.9: Migrate conflict-dialog-controller

Changes to `src/components/shared/conflict-dialog-controller.ts`:
- Replace `fetch('/api/projects/.../launcher-config')` with call to `getMergedLauncherConfig` query
- Replace `fetchLastUsedProfile` / `saveLastUsedProfile` with calls to `getLastUsedProfile` / `saveLastUsedProfile` from `launcher-api.ts`

### Step 3.10: Migrate open-config-dir usage

Currently the open-config-dir button calls `/api/open-config-dir`. Find where it is called in the UI and replace with a direct call to the plain `"use server"` function from `shared-api.ts`.

### Acceptance criteria for Phase 3:
- No component, controller, or state module imports from `~/lib/api.js`, `~/lib/add-project.js`, `~/lib/delete-project.js`, `~/lib/fetch-boards.js`, `~/lib/last-used-profile.js`
- No component calls `fetch('/api/...')`
- All mutations use action-returned discriminated results
- All reads use query/createAsync
- `npm run test:all` passes

Edge cases for Phase 3:
- Binary file serving: `<img>` tags for ticket file images still reference `/api/projects/.../files/...` URL. These two API routes survive deletion (see Phase 4 note).
- File content loading for non-image files (text): Convert to use the `getContext` server function that returns `{ content: string }` JSON.
- Upload via FormData: The `uploadFile` action receives `FormData`. SolidStart `action()` supports `FormData` natively.
- The sync-pending polling timer: Use `setInterval(() => revalidate("sync-pending"), 2000)` in the component. The `createAsync` for `getSyncPending` query handles the data.

---

## Phase 4: Delete Dead Code

### Step 4.1: Delete API route files

Delete the entire `src/routes/api/` directory EXCEPT:
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/files/[fileName].ts` (binary file serving)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/references/content.ts` (binary reference serving)

Specific files to delete (44 files):
- `src/routes/api/boards.ts`
- `src/routes/api/boards/[boardId].ts`
- `src/routes/api/boards/[boardId]/columns.ts`
- `src/routes/api/boards/[boardId]/columns/[columnName].ts`
- `src/routes/api/boards/[boardId]/columns/[columnName]/rename.ts`
- `src/routes/api/boards/[boardId]/columns/reorder.ts`
- `src/routes/api/browse.ts`
- `src/routes/api/last-used-profile.ts`
- `src/routes/api/launcher-config.ts`
- `src/routes/api/launcher-config/profiles.ts`
- `src/routes/api/launcher-config/shortcuts.ts`
- `src/routes/api/launcher-config/skills.ts`
- `src/routes/api/launcher-config/skills/reorder.ts`
- `src/routes/api/launcher-config/templates.ts`
- `src/routes/api/open-config-dir.ts`
- `src/routes/api/open-config-dir.test.ts`
- `src/routes/api/pick-directory.ts`
- `src/routes/api/projects.ts`
- `src/routes/api/projects/[projectSlug].ts`
- `src/routes/api/projects/[projectSlug]/board-id.ts`
- `src/routes/api/projects/[projectSlug]/board/pending.ts`
- `src/routes/api/projects/[projectSlug]/board/reorder.ts`
- `src/routes/api/projects/[projectSlug]/board/resolve-conflicts.ts`
- `src/routes/api/projects/[projectSlug]/board/sync.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName].ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/ai/pull-and-retry.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/ai/run.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/archive.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/context/[name].ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/files/upload.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/references.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/shortcut/run.ts`
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/use-worktree.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/column-defaults.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/conflict-resolution.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/profiles.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/shortcuts.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/skills.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/skills/reorder.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/templates.ts`
- `src/routes/api/projects/[projectSlug]/launcher-config/worktree-root-path.ts`
- `src/routes/api/projects/[projectSlug]/name.ts`
- `src/routes/api/projects/[projectSlug]/worktree-cleanup.ts`

### Step 4.2: Delete route helpers

Files to delete:
- `src/core/shared/route-helpers.ts`
- `src/core/shared/route-helpers.test.ts`
- `src/core/shared/launcher-config-routes.ts`

### Step 4.3: Delete lib wrappers

Files to delete:
- `src/lib/api.ts`
- `src/lib/add-project.ts`
- `src/lib/delete-project.ts`
- `src/lib/fetch-boards.ts`
- `src/lib/last-used-profile.ts`
- `src/lib/sync-pending-poller.ts`
- `src/lib/sync-pending-poller.test.ts`

### Step 4.4: Delete src/core/actions.ts

This file is replaced by `src/components/project/project-api.ts`. Any remaining imports of `~/core/actions` must be updated.

### Step 4.5: Update the two surviving API route files

The two binary-serving routes (`files/[fileName].ts` and `references/content.ts`) currently import from `~/server/shared/route-helpers.js`. They need to:
- Replace `withTicketStore` with inline logic that creates a `TicketStore` and resolves the worktree dir
- Import directly from `~/core/config/instances.js` and `~/core/ticket/ticket-store.js`
- Remove the dependency on deleted route helpers

### Step 4.6: Clean up middleware

`src/middleware.ts` logs `/api/` requests. Since nearly all API routes are deleted, either:
- Remove the `/api/` filter and log all requests, or
- Delete the middleware file and remove the `middleware` reference from `app.config.ts`

Decision: Keep the middleware but update the filter to log server function calls or remove the path filter entirely.

### Acceptance criteria for Phase 4:
- `src/routes/api/` contains only the two binary file routes and their parent directories
- `src/core/shared/route-helpers.ts` and `launcher-config-routes.ts` no longer exist
- `src/lib/api.ts`, `add-project.ts`, `delete-project.ts`, `fetch-boards.ts`, `last-used-profile.ts`, `sync-pending-poller.ts` no longer exist
- `src/core/actions.ts` no longer exists
- No file imports from any deleted module
- `npm run test:all` passes

---

## Phase 5: Delete Tests, Update CLAUDE.md, Final Validation

### Step 5.1: Delete controller tests that mock fetch

Files to delete:
- `src/components/project/project-page-controller.test.ts`
- `src/components/ticket/ticket-detail-state.test.ts`
- `src/components/launcher/agent-launcher-controller.test.ts`
- `src/components/launcher/LauncherSettings.test.ts`
- `src/components/shared/conflict-dialog-controller.test.ts`
- `src/components/ticket/archive-ticket-controller.test.ts`
- `src/components/ticket/create-ticket-controller.test.ts`
- `src/components/ticket/delete-ticket-controller.test.ts`
- `src/components/ticket/edit-ticket-controller.test.ts`

Note: Before deleting, verify each test file. If any test tests pure logic (not fetch mocking), keep those tests or move them to the pure module's test file.

Tests to KEEP (they test pure functions, not fetch):
- `src/components/launcher/agent-launcher-pure.test.ts`
- `src/components/launcher/launcher-settings-pure.test.ts`
- `src/components/project/project-page-pure.test.ts`
- `src/components/project/board-selector.test.ts`
- `src/components/ticket/ticket-detail-pure.test.ts`
- `src/components/shared/conflict-dialog-pure.test.ts`
- `src/components/shared/theme-toggle-pure.test.ts`
- `src/components/shared/worktree-cleanup-pure.test.ts`
- `src/components/board/board-state.test.ts`
- `src/components/board/drop-index.test.ts`
- `src/components/board/list-reorder.test.ts`
- `src/components/board/KanbanBoard.render.test.tsx`
- `src/components/ticket/TicketCard.test.tsx`
- `src/components/ticket/TicketDetailDialog.test.tsx`
- All `src/core/**/*.test.ts` files

Also delete:
- `src/routes/api/open-config-dir.test.ts` (already listed in Phase 4 but ensure it is gone)
- `src/core/shared/route-helpers.test.ts` (already listed in Phase 4)
- `src/lib/sync-pending-poller.test.ts` (already listed in Phase 4)

### Step 5.2: Update launcher-settings-pure.ts

The `itemEndpoint` function in `src/components/launcher/launcher-settings-pure.ts` currently returns URL paths like `/api/launcher-config/templates`. This function is no longer needed since the component calls server functions directly. Either delete it or update it. Since it is also tested in `launcher-settings-pure.test.ts`, if the function is deleted, update the test file too.

### Step 5.3: Update CLAUDE.md

Changes to `CLAUDE.md`:
- Remove the "Complex component architecture" section (the three-layer requirement). Replace with: "Split complex components when the non-UI logic is substantial enough to test in isolation. Use pure function modules for stateless data transforms. Thin controllers may be collapsed into their components."
- Add note about data primitives: "Use SolidStart query()/action()/createAsync for all data access. Server functions use 'use server' and are colocated with features in *-api.ts files under src/components/."
- Update import path references if any mention `src/server/` -- change to `src/core/`

### Step 5.4: Update CONTEXT.md if needed

If CONTEXT.md references `src/server/` directory structure, update to `src/core/`.

### Step 5.5: Run full test suite

```
npm run test:all
```

This runs: `tsc --noEmit && eslint . && vitest run --exclude 'e2e/**' && vinxi build && tsx scripts/testid-coverage.ts && vitest run e2e/`

Acceptance criteria:
- All unit tests pass
- Build succeeds
- All e2e tests pass (30 test files)
- No TypeScript errors
- No ESLint errors

---

## File Inventory Summary

### Files to CREATE (5 new files):
- `src/components/project/project-api.ts`
- `src/components/board/board-api.ts`
- `src/components/ticket/ticket-api.ts`
- `src/components/launcher/launcher-api.ts`
- `src/components/shared/shared-api.ts`

### Files to DELETE (~60 files):
- 44 API route files (see Phase 4.1 list)
- `src/core/shared/route-helpers.ts`
- `src/core/shared/route-helpers.test.ts`
- `src/core/shared/launcher-config-routes.ts`
- `src/core/actions.ts`
- `src/lib/api.ts`
- `src/lib/add-project.ts`
- `src/lib/delete-project.ts`
- `src/lib/fetch-boards.ts`
- `src/lib/last-used-profile.ts`
- `src/lib/sync-pending-poller.ts`
- `src/lib/sync-pending-poller.test.ts`
- `src/routes/api/open-config-dir.test.ts`
- `src/components/project/project-page-controller.test.ts`
- `src/components/ticket/ticket-detail-state.test.ts`
- `src/components/launcher/agent-launcher-controller.test.ts`
- `src/components/launcher/LauncherSettings.test.ts`
- `src/components/shared/conflict-dialog-controller.test.ts`
- `src/components/ticket/archive-ticket-controller.test.ts`
- `src/components/ticket/create-ticket-controller.test.ts`
- `src/components/ticket/delete-ticket-controller.test.ts`
- `src/components/ticket/edit-ticket-controller.test.ts`

### Files to RENAME (directory rename):
- `src/server/` renamed to `src/core/` (all ~65 files move)

### Files to MODIFY (~25 files):
- `src/core/shared/errors.ts` (remove statusCode, delete PayloadError)
- `src/core/launcher/agent-launch.ts` (return discriminated results instead of throwing PayloadError)
- `src/routes/project/[projectSlug].tsx` (update imports)
- `src/routes/index.tsx` (update imports)
- `src/routes/add-project.tsx` (update imports)
- `src/components/project/project-page-controller.ts` (replace fetch with action calls)
- `src/components/project/add-project-controller.ts` (replace fetch with action calls)
- `src/components/ticket/ticket-detail-state.ts` (replace all fetch calls)
- `src/components/ticket/ticket-detail-upload.ts` (replace fetch with action)
- `src/components/ticket/ticket-detail-header.ts` (replace apiFetch with action)
- `src/components/ticket/ticket-detail-shortcuts.ts` (replace fetch with action)
- `src/components/launcher/launcher-settings-state.ts` (replace all fetch calls)
- `src/components/launcher/agent-launcher-controller.ts` (replace fetch with action)
- `src/components/launcher/launcher-settings-pure.ts` (remove itemEndpoint or update)
- `src/components/shared/conflict-dialog-controller.ts` (replace fetch with query/action)
- `src/middleware.ts` (update or simplify)
- `CLAUDE.md` (remove three-layer requirement, add data primitives note)
- ~106 files for `~/server/` to `~/core/` import path updates (Phase 1)

---

## Dependency Graph

```
Phase 0 (error cleanup)
  |
  v
Phase 1 (rename src/server/ -> src/core/)
  |
  v
Phase 2 (create *-api.ts files) -- depends on Phase 1 for import paths
  |
  v
Phase 3 (migrate components) -- depends on Phase 2 for new server functions
  |
  v
Phase 4 (delete dead code) -- depends on Phase 3 (old routes no longer called)
  |
  v
Phase 5 (cleanup tests, docs) -- depends on Phase 4
```

Within Phase 3, steps can be done in any order since each feature area is independent. However, Step 3.4 (project page controller) should come first since it is the most visible route.

---

## Validation Checks

After each phase, run:
1. `tsc --noEmit` -- no type errors
2. `npx eslint .` -- no lint errors
3. `vitest run --exclude 'e2e/**'` -- all unit tests pass
4. `vinxi build` -- production build succeeds
5. `vitest run e2e/` -- all 30 e2e test files pass

After the final phase, additionally verify:
- No file in `src/` contains `fetch("/api/` (except the two binary routes and possibly their tests)
- No file imports from `~/lib/api.js`, `~/lib/add-project.js`, `~/lib/delete-project.js`, `~/lib/fetch-boards.js`, `~/lib/last-used-profile.js`
- No file imports from `~/server/` (should all be `~/core/`)
- `PayloadError` does not exist
- `statusCode` does not appear in `AppError`
- `src/core/shared/route-helpers.ts` does not exist
- Every error path in the UI still displays an error (no silently swallowed errors)

---

## Edge Cases and Risks

1. Binary file serving: SolidStart server functions cannot return raw binary `Response` objects through the serialization layer. Two API routes must survive for serving images and arbitrary file downloads. Components that reference these URLs (e.g., `<img>` tags, text file loading) continue using URL-based access.

2. FormData in action(): SolidStart actions support `FormData` natively, but verify that the `uploadFile` action works correctly with the `FormData` parameter in the Electron environment.

3. Revalidation timing: When revalidation is moved inside action server functions (per PRD decision 15), ensure the `revalidate()` call is imported from `@solidjs/router` and works server-side. If not, keep revalidation on the client side after the action completes.

4. "use server" in non-route files: SolidStart requires that files using `"use server"` are properly handled by the bundler. The `*-api.ts` files under `src/components/` must be recognized by SolidStart as containing server functions. This typically works if the file is imported by a client component that the bundler processes.

5. Middleware logging: After most API routes are deleted, the middleware `/api/` filter will only log the two surviving binary routes. Consider updating it to also log server function RPC calls if SolidStart exposes that.

6. Import cycles: The new `*-api.ts` files import from `~/core/` (stores/managers) and are imported by components. Ensure no circular dependency between `project-api.ts` and the route files.

7. pick-directory.ts complexity: The directory picker logic (`pick-directory.ts`) is substantial (190 lines of platform-specific code). When moving to a server function, all of this logic must be preserved. Consider extracting the platform picker functions to a separate file in `src/core/infra/` (e.g., `directory-picker.ts`) and having the server function call that.

8. The `resolveTicketAndProject` function in `agent-launch.ts` is used by both the `launchAgent` and `runShortcut` server functions. It stays in `src/core/launcher/agent-launch.ts` and is imported by `launcher-api.ts`.

9. Query keys must remain consistent. Current keys are `"default-project-slug"` and `"project-page"`. New keys added: `"boards"`, `"launcher-config"`, `"sync-pending"`, `"last-used-profile"`. Revalidation calls in actions must use the correct keys.

10. Error handling consistency: The PRD states reads (queries) throw errors caught by ErrorBoundary, while mutations (actions) return discriminated results. Verify every server function follows this convention -- queries throw on error, actions return `{ ok: false, ... }`.

### Critical Files for Implementation
- `src/core/shared/errors.ts` (Phase 0: error class cleanup)
- `src/components/project/project-api.ts` (Phase 2: primary server function file)
- `src/components/ticket/ticket-api.ts` (Phase 2: ticket CRUD server functions)
- `src/components/ticket/ticket-detail-state.ts` (Phase 3: most complex migration, ~15 fetch calls)
- `src/components/launcher/launcher-settings-state.ts` (Phase 3: second most complex, ~20 fetch calls)
