# ST-0023 Detailed Implementation Plan

## Goal

Show a yellow dot badge on the sync button when local ticket changes have not been pushed. A WebSocket channel pushes dirty state from server to client in real time.

## Architecture Overview

- Server: SolidStart (vinxi 0.5.11 / nitropack 2.13.4 / h3 1.15.11) with file-based API routes under `src/routes/api/`.
- Client: SolidJS with reactive signals.
- Services are singletons registered in `src/server/config/service-container.ts` and exported from `src/server/config/instances.ts`.
- The file watcher (`src/server/infra/file-watcher.ts`) uses chokidar and runs a debounced auto-commit on file changes.
- The sync route (`src/routes/api/projects/[projectSlug]/board/sync.ts`) calls `ticketSyncManager.sync()`.
- The project page controller (`src/components/project/project-page-controller.ts`) owns sync state signals.
- The sync button lives inline in `src/routes/project/[projectSlug].tsx` with a conflict badge at `absolute -top-1 -right-1`.
- Tests: unit tests under `src/**/*.test.ts`, rendering tests under `src/**/*.test.tsx` (jsdom), e2e tests under `e2e/` (playwright + real server).
- Nitro supports WebSocket via `defineWebSocketHandler` (h3). Requires enabling `experimental.websocket` in the nitro config within `app.config.ts`.

## Key Constraints (from CLAUDE.md)

- Never use bare "slug". Always qualify: `projectSlug`, `columnSlug`, etc.
- Do not use z-index / Tailwind z-* classes. Use Portal from solid-js/web for stacking.
- Do not change button text when running; use disabled state.
- Separate data from behavior in types.
- Split complex components into pure functions / controller / component layers.
- Do not add comments unless asked.
- Do not add Co-Authored-By lines to commit messages.
- Never push to remote.
- Pin exact dependency versions in package.json.

## Steps

### Step 1: Enable WebSocket support in nitro

File: `app.config.ts`

Add `server.experimental.websocket: true` to the SolidStart config. This tells nitro to support WebSocket upgrades on routes that export a `defineWebSocketHandler`.

Change:
```typescript
server: {
  preset: "node-server",
}
```
To:
```typescript
server: {
  preset: "node-server",
  experimental: {
    websocket: true,
  },
}
```

Acceptance criteria:
- `npm run build` succeeds.
- The built server supports WebSocket upgrade requests.

---

### Step 2: Create the board event hub service

File to create: `src/server/board/board-event-hub.ts`

This is a server-side service that:
- Stores a `Map<string, Set<Peer>>` keyed by `worktreeDir`.
- Provides `addPeer(worktreeDir, peer)`, `removePeer(worktreeDir, peer)`, and `notify(worktreeDir, event)`.
- The event type is a discriminated union (start with `{ type: "syncPending"; hasPendingChanges: boolean }`).

Types (data-only, separate from behavior):
```typescript
export interface SyncPendingEvent {
  type: "syncPending";
  hasPendingChanges: boolean;
}
export type BoardEvent = SyncPendingEvent;
```

The hub class:
```typescript
export class BoardEventHub {
  private peers: Map<string, Set<Peer>>;

  addPeer(worktreeDir: string, peer: Peer): void
  removePeer(worktreeDir: string, peer: Peer): void
  notify(worktreeDir: string, event: BoardEvent): void
}
```

Where `Peer` is the h3/crossws `Peer` type (from `crossws`). Each peer is sent `JSON.stringify(event)` via `peer.send(...)`.

Acceptance criteria:
- Unit test: `src/server/board/board-event-hub.test.ts`
  - `notify` sends to all peers for a given worktreeDir.
  - `removePeer` stops delivery to that peer.
  - `notify` to a worktreeDir with no peers does not throw.
  - Peers for different worktreeDirs are independent.
- Use a mock peer (object with a `send` spy) in tests.

---

### Step 3: Register the hub in the service container

Files to modify:
- `src/server/config/service-container.ts`: Add `boardEventHub: BoardEventHub` to `ServiceContainer` interface. Instantiate it in `createServices()`.
- `src/server/config/instances.ts`: Export `boardEventHub` from the loaded services.

Acceptance criteria:
- TypeScript compiles.
- `boardEventHub` is available as a singleton import from `~/server/config/instances.js`.

---

### Step 4: Create the WebSocket route for board events

File to create: `src/routes/api/projects/[projectSlug]/board/events.ts`

This file exports a `defineWebSocketHandler` from h3. On the `open` hook:
1. Extract `projectSlug` from the URL path (the URL is available on `peer.request.url` or via context). Parse it from the path string since h3 WebSocket handlers do not receive params like REST handlers.
2. Resolve `worktreeDir` via `worktreeManager.getWorktreeDir(projectSlug)`.
3. Register the peer with `boardEventHub.addPeer(worktreeDir, peer)`.
4. Compute initial `hasPendingChanges`:
   - Run `git rev-list @{u}..HEAD --count` in the worktreeDir.
   - If upstream is missing (no tracking branch), count as pending.
   - Also check `git status --porcelain` for uncommitted changes.
   - Send the initial `{ type: "syncPending", hasPendingChanges }` event.

On the `close` hook:
- Call `boardEventHub.removePeer(worktreeDir, peer)`.

On the `message` hook: no-op (server-push only channel).

Edge cases:
- If `worktreeManager.getWorktreeDir()` throws (bad projectSlug), close the peer.
- If git commands fail during initial check (e.g., no git repo yet), send `hasPendingChanges: false` as a safe default? No -- per CLAUDE.md "never add silent fallback defaults." Instead, send `hasPendingChanges: true` since having no upstream always means local-only changes.

Acceptance criteria:
- The route file exports a default handler created by `defineWebSocketHandler`.
- On connect, the server sends the initial hasPendingChanges state.
- On disconnect, the peer is removed from the hub.

---

### Step 5: Wire file watcher to push hasPendingChanges: true

File to modify: `src/server/infra/file-watcher.ts`

Add a callback mechanism so the file watcher can notify external listeners on file change events (before the debounced commit). The cleanest approach: accept an optional `onFileChange?: (worktreeDir: string) => void` callback in the `FileWatcher` constructor or as a setter.

Changes:
- Add a `private onFileChange: ((worktreeDir: string) => void) | null = null` field.
- Add a `setOnFileChange(cb: (worktreeDir: string) => void): void` method.
- In the chokidar event handlers (add, change, unlink, addDir, unlinkDir), before calling `debouncedCommit`, call `this.onFileChange?.(worktreeDir)`.

Then in `src/server/config/service-container.ts`, wire it:
```typescript
fileWatcher.setOnFileChange((worktreeDir) => {
  boardEventHub.notify(worktreeDir, { type: "syncPending", hasPendingChanges: true });
});
```

Acceptance criteria:
- Existing file watcher tests still pass (the callback is optional).
- New unit test in `src/server/infra/file-watcher.test.ts`: verify that `onFileChange` is called on file change events.
- The hub receives `hasPendingChanges: true` whenever a file changes in a watched worktree.

---

### Step 6: Wire sync route to push hasPendingChanges: false

File to modify: `src/routes/api/projects/[projectSlug]/board/sync.ts`

After a successful sync (`result.status === "success"`), call `boardEventHub.notify(worktreeDir, { type: "syncPending", hasPendingChanges: false })`.

Import `boardEventHub` from `~/server/config/instances.js` (already used in this file pattern).

Changes to the POST handler:
```typescript
export const POST = withProject(async (ctx) => {
  const result = await operationTracker.track(ticketSyncManager.sync(ctx.worktreeDir));
  if (result.status === "success") {
    boardEventHub.notify(ctx.worktreeDir, { type: "syncPending", hasPendingChanges: false });
  }
  return Response.json(result);
});
```

Acceptance criteria:
- After a successful sync, hasPendingChanges: false is broadcast.
- Non-success results (conflict, error) do not broadcast.

---

### Step 7: Create the client-side board events module

File to create: `src/lib/board-events-client.ts`

This module:
- Exports a `createBoardEventsClient(projectSlug: Accessor<string>)` function.
- Returns `{ hasPendingChanges: Accessor<boolean> }`.
- Opens a WebSocket to `ws://HOST/api/projects/${projectSlug}/board/events`.
- Parses incoming JSON messages and updates the `hasPendingChanges` signal.
- On `projectSlug` change (using `createEffect`), closes the old connection and opens a new one.
- Implements reconnect with exponential backoff (1s, 2s, 4s, 8s, cap at 30s). Reset backoff on successful open.
- Cleans up (closes connection) via `onCleanup`.

The WebSocket URL must handle both `http` and `https` protocols (convert to `ws`/`wss`). Use `window.location` to derive the base.

Edge cases:
- If `projectSlug()` is empty, do not connect.
- If the component unmounts during a reconnect timeout, cancel the timeout.
- If the WebSocket is not supported (SSR), skip. Guard with `if (typeof window === "undefined") return`.

Acceptance criteria:
- Unit test `src/lib/board-events-client.test.ts`:
  - Mock WebSocket globally.
  - Verify that on message `{ type: "syncPending", hasPendingChanges: true }`, the signal becomes true.
  - Verify that on message `{ type: "syncPending", hasPendingChanges: false }`, the signal becomes false.
  - Verify that changing projectSlug closes old WS and opens new.
  - Verify reconnect scheduling on close.

---

### Step 8: Show the yellow dot badge on the sync button

File to modify: `src/routes/project/[projectSlug].tsx`

Changes:
1. Import and call `createBoardEventsClient` at the component level, passing the reactive `projectSlug`.
2. Add a `<Show>` block for the yellow dot badge, placed right after the conflict badge `<Show>` block.

Badge markup (same position pattern as the conflict badge but yellow, no text, smaller):
```tsx
<Show when={hasPendingChanges() && !ld()?.hasConflict}>
  <span
    class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-yellow-400"
    data-testid="sync-button-pending-badge"
  />
</Show>
```

Rules:
- Conflict badge takes priority: when `hasConflict` is true, hide the yellow dot.
- The dot shows regardless of whether a remote is configured.
- Do not change the sync button text or behavior.

Acceptance criteria:
- The yellow dot appears when `hasPendingChanges` is true.
- The yellow dot is hidden when `hasConflict` is true (conflict badge wins).
- The `data-testid="sync-button-pending-badge"` is present for e2e tests.

---

### Step 9: Add e2e test for the pending badge

File to modify: `e2e/sync-button.test.ts`

Add new test cases using the existing `setupE2E`, `createProject`, `gotoProject` fixtures:

Test 1: "pending badge appears after creating a ticket"
1. Create a project with a remote and no tickets.
2. Push the initial branch so the remote tracking is set up.
3. Navigate to the project board.
4. Wait for the WebSocket to connect and initial state to settle (no pending badge initially -- because the project was just synced).
5. Create a ticket via the UI (click "+ New Ticket", fill form, submit).
6. Wait for `[data-testid="sync-button-pending-badge"]` to appear (visible, timeout 15000).

Test 2: "pending badge disappears after sync"
1. Continue from test 1 state (or set up fresh with a ticket).
2. Click the sync button.
3. Wait for `[data-testid="sync-button-pending-badge"]` to disappear (hidden/detached, timeout 20000).

Test 3: "pending badge absent on fresh project with no changes"
1. Create a project with a remote and tickets already pushed.
2. Navigate to the project.
3. Wait a moment for WebSocket connection.
4. Assert `[data-testid="sync-button-pending-badge"]` count is 0.

Test 4: "conflict badge takes priority over pending badge"
- If a conflict state can be set up (this may already be tested in `e2e/conflict-dialog.test.ts`), verify the yellow dot is not shown when conflict badge is active. This could be a lightweight assertion added to the existing conflict test, or skipped if too complex to set up.

Acceptance criteria:
- All new e2e tests pass.
- Existing e2e tests remain green.

---

### Step 10: Run full test suite

Command: `npm run test:all`

This runs `tsc --noEmit && eslint . && vitest run --exclude 'e2e/**' && vinxi build && tsx scripts/testid-coverage.ts && vitest run e2e/`.

Acceptance criteria:
- All tests pass.
- No type errors.
- No lint errors.
- Build succeeds.
- e2e tests pass.

## File Change Summary

New files:
- `src/server/board/board-event-hub.ts` (hub service)
- `src/server/board/board-event-hub.test.ts` (hub unit tests)
- `src/routes/api/projects/[projectSlug]/board/events.ts` (WebSocket route)
- `src/lib/board-events-client.ts` (client WebSocket module)
- `src/lib/board-events-client.test.ts` (client unit tests)

Modified files:
- `app.config.ts` (enable experimental websocket)
- `src/server/config/service-container.ts` (register hub)
- `src/server/config/instances.ts` (export hub)
- `src/server/infra/file-watcher.ts` (add onFileChange callback)
- `src/server/infra/file-watcher.test.ts` (test callback)
- `src/routes/api/projects/[projectSlug]/board/sync.ts` (notify after sync)
- `src/routes/project/[projectSlug].tsx` (add yellow dot badge + hook)
- `e2e/sync-button.test.ts` (add pending badge e2e tests)

## Dependency Graph

```
Step 1 (nitro websocket config)
  |
Step 2 (board event hub)
  |
Step 3 (register in service container)
  |
  +---> Step 4 (WebSocket route)
  |       |
  +---> Step 5 (file watcher -> hub)
  |       |
  +---> Step 6 (sync route -> hub)
  |
Step 7 (client board events module) -- independent of Steps 4-6
  |
Step 8 (yellow dot badge) -- depends on Step 7
  |
Step 9 (e2e tests) -- depends on all above
  |
Step 10 (full test suite)
```

Steps 4, 5, and 6 can be done in parallel after Step 3.
Step 7 can be done in parallel with Steps 4-6 (only depends on knowing the message format from Step 2).
Step 8 depends on Step 7.
Step 9 depends on everything.

## Edge Cases

- No remote configured: the dot still shows if there are local uncommitted/unpushed changes. The PRD says: "The dot shows regardless of whether a remote is configured."
- No upstream branch: `git rev-list @{u}..HEAD` fails with "no upstream configured". Catch this and treat as hasPendingChanges: true.
- Empty worktree (no commits yet): `git status --porcelain` on an empty worktree with no commits may behave differently. The initial orphan commit is created by `ensureWorktree`, so by the time the WebSocket connects the worktree should have at least one commit.
- Rapid project switching: the client closes the old WebSocket and opens a new one. The server `close` hook removes the peer. The new connection gets fresh initial state.
- Multiple browser tabs: each tab opens its own WebSocket. The hub stores multiple peers per worktreeDir. All get notified.
- Server restart: the WebSocket closes, client reconnects with exponential backoff, gets fresh initial state.
- File changes during sync: the file watcher fires hasPendingChanges: true, then the sync completes and fires hasPendingChanges: false. The dot may flicker briefly. This is acceptable -- it reflects reality.
- WebSocket in e2e tests: the real server e2e harness starts the built server. WebSocket support must be included in the build (Step 1). The e2e tests connect via playwright which runs a real browser with native WebSocket support.

## Validation Checklist

- [ ] `npm run build` succeeds with websocket enabled
- [ ] Unit tests for BoardEventHub pass
- [ ] Unit tests for FileWatcher onFileChange callback pass
- [ ] Unit tests for board-events-client pass
- [ ] Existing unit tests still pass
- [ ] e2e: pending badge appears on file change
- [ ] e2e: pending badge disappears after sync
- [ ] e2e: conflict badge takes priority
- [ ] `npm run test:all` passes
- [ ] No type errors (`tsc --noEmit`)
- [ ] No lint errors (`eslint .`)
