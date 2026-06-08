## Implementation Plan: Ticket Branch Conflict Resolution (ST-0009)

### Overview

Add a Sync button to the board toolbar that commits local ticket changes, rebases on the remote ticket branch, and pushes. When rebase conflicts occur, a dialog offers to launch Claude for automated resolution. Also removes all autoCommit calls from TicketStore and TicketOrderStore.

### Architecture Notes

SolidJS + SolidStart app. Server code in `src/server/`. UI in `src/components/`. API routes under `src/routes/api/`. Tests: vitest for unit (`.test.ts`), Playwright via vitest for e2e (`e2e/`). Git operations use `git()` and `gitSync()` from `src/server/git.ts`. Config extends `LauncherConfig` in `src/types.ts`, managed by `LauncherConfigManager` in `src/server/launcher-config.ts`. Board data loads via `loadBoard` query in `src/server/actions.ts` with cache key `"board-data"`.

### Step 1: Remove autoCommit from TicketStore and TicketOrderStore

Files to modify:
- `src/server/ticket-store.ts` -- remove import of `autoCommit as gitAutoCommit` from `./git.js`, remove private `autoCommit` method, remove all `this.autoCommit(...)` calls (11 call sites at lines 132, 187, 201, 216, 225, 251, 266, 342, 359, 381, 390)
- `src/server/ticket-order.ts` -- remove import of `autoCommit` from `./git.js`, remove private `commit` method, remove call to `this.commit('update ticket order')` in `write` method

Acceptance criteria:
- Ticket mutations no longer produce git commits
- Changes written to filesystem remain uncommitted

### Step 2: Add conflict resolution fields to LauncherConfig

Files to modify:
- `src/types.ts` -- add `conflictResolutionPrompt?: string` and `conflictResolutionProfileName?: string` to `LauncherConfig`, add resolved versions to `MergedLauncherConfig`
- `src/server/launcher-config.ts` -- add `DEFAULT_CONFLICT_RESOLUTION_PROMPT` constant, update `parseConfig` and `getMergedConfig`, add `saveConflictResolutionSettings` method

Default prompt: "This is a ticket management worktree with an in-progress git rebase that has merge conflicts. Resolve all conflicts in the affected files, keeping the intent of both sides where possible. For status.json files prefer the version with the more recent data. After resolving each conflict, stage the files and run git rebase --continue. Repeat until the rebase completes. Then push to remote."

Acceptance criteria:
- `getMergedConfig` returns `conflictResolutionPrompt` (defaults to pre-written prompt) and `conflictResolutionProfileName` (defaults to null)
- Fields round-trip through save/load

### Step 3: Create TicketSyncManager

File to create: `src/server/ticket-sync.ts`

Exports:
- `SyncResult` type: `{ status: 'success' } | { status: 'conflict' } | { status: 'error'; message: string }`
- `TicketSyncManager` class with methods:
  - `hasRemote(worktreeDir)` -- uses `git rev-parse --abbrev-ref --symbolic-full-name @{u}`, returns false on error
  - `sync(worktreeDir)` -- commit all (`git add -A`, commit if porcelain not empty), fetch, check if behind, rebase, push. Returns conflict status if rebase fails
  - `abort(worktreeDir)` -- runs `git rebase --abort`

Uses `git()` from `./git.js`. Follow patterns from `src/server/worktree-manager.ts`.

Acceptance criteria:
- sync with no conflicts returns `{ status: 'success' }`
- sync hitting conflict returns `{ status: 'conflict' }`
- abort restores pre-rebase state
- hasRemote returns false when no tracking branch

### Step 4: Register TicketSyncManager singleton

File to modify: `src/server/instances.ts`

Add import and export: `export const ticketSyncManager = new TicketSyncManager();`

### Step 5: Add hasRemote to board data

File to modify: `src/server/actions.ts`

Add `hasRemote` field to `BoardPageData`. In `loadBoard`, call `ticketSyncManager.hasRemote(worktreeDir)` and include result.

### Step 6: Create sync API route

File to create: `src/routes/api/projects/[slug]/board/sync.ts`

- POST: calls `ticketSyncManager.sync(worktreeDir)`, returns SyncResult JSON
- DELETE: calls `ticketSyncManager.abort(worktreeDir)`, returns success JSON

Follow pattern from `src/routes/api/projects/[slug]/board/reorder.ts`.

### Step 7: Create resolve-conflicts API route

File to create: `src/routes/api/projects/[slug]/board/resolve-conflicts.ts`

POST: launches Claude via the configured profile with the conflict resolution prompt in the ticket worktree directory. Reuses spawn pattern from agent launch infrastructure. Uses `{{initialPrompt}}` template variable. Default profile: `Claude Win` on Windows, `Claude macOS` on macOS.

### Step 8: Create conflict resolution settings API route

File to create: `src/routes/api/projects/[slug]/launcher-config/conflict-resolution.ts`

PUT: saves `conflictResolutionPrompt` and `conflictResolutionProfileName` via `launcherConfigManager.saveConflictResolutionSettings()`.

### Step 9: Add Sync button to board toolbar

File to modify: `src/routes/project/[slug].tsx`

- Add signals: `syncing`, `syncSuccess`, `conflictDialogOpen`
- Add `handleSync` function: POST to sync endpoint, handle success/conflict/error
- Render Sync button in header toolbar (near settings button), hidden when `!hasRemote`
- Three visual states: idle (sync/refresh icon), syncing (disabled), success (check icon, reverts after 2s)
- Both icons 16x16 SVGs matching existing toolbar icon dimensions

### Step 10: Create ConflictDialog component

File to create: `src/components/ConflictDialog.tsx`

Follow pattern from `src/components/ArchiveTicketDialog.tsx` (fixed overlay, card, two buttons).

Props: `open`, `onOpenChange`, `onResolve`, `onAbort`
- "Abort" calls DELETE sync endpoint, closes dialog
- "Resolve with Claude" calls POST resolve-conflicts endpoint, closes dialog
- Both buttons disable during submission
- Error display for failures

Wire up in `[slug].tsx` with handlers for resolve and abort.

### Step 11: Add conflict resolution settings to Settings General tab

File to modify: `src/components/LauncherSettings.tsx`

Add below worktree root path section:
- Textarea for conflict resolution prompt (saves on blur)
- Dropdown for coding agent profile (lists all profiles, default option for platform default)
- Both save via PUT to conflict-resolution config endpoint

### Step 12: Update mock server for e2e tests

Files to modify: `e2e/mock-server.ts`, `e2e/setup-test-data.ts`

- Add `hasRemote` to BoardPageData
- Add handlers for sync, abort, resolve-conflicts endpoints
- Add configurable callbacks to MockServerState

### Step 13: Write tests

New files:
- `src/server/ticket-sync.test.ts` -- (a) sync no conflicts succeeds, (b) sync conflict returns status and abort restores state
- `e2e/sync-button.test.ts` -- (a) button hidden when no remote, (b) check icon after success, (c) conflict dialog and abort

Modify:
- `src/server/ticket-store.test.ts` -- remove/update autoCommit tests
- `src/server/ticket-order.test.ts` -- verify write persists but does not commit
- `src/server/launcher-config.test.ts` -- add conflict resolution config round-trip tests

### Step 14: Update file-watcher tests

File to modify: `src/server/file-watcher.test.ts`

Remove or rewrite tests that reference TicketStore autoCommit behavior since autoCommit is removed.

### Dependency Graph

Steps 1, 2, 3 -- independent, parallel
Step 4 -- depends on 3
Steps 5, 6 -- depend on 3, 4
Steps 7, 8 -- depend on 2
Step 10 -- depends on 6, 7
Step 9 -- depends on 5, 6, 10
Step 11 -- depends on 8
Step 12 -- depends on 5
Steps 13, 14 -- depend on all above

### Edge Cases

- No local changes and already up to date: sync succeeds silently
- No remote tracking branch: button hidden entirely
- Multiple conflicts across commits: Claude handles multiple rebase --continue cycles
- Network failure during fetch/push: git() wraps errors; sync returns error status
- Index.lock contention: eliminated by removing autoCommit -- only sync flow touches git
- Empty conflict resolution prompt in config: falls back to default constant
- Profile name not found: falls back to platform-appropriate default
- Claude fails to resolve: rebase remains in-progress; user can retry or abort
