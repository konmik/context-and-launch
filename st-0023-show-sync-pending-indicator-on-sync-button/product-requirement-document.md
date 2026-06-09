# ST-0023: Show sync pending indicator on sync button

## Problem Statement

The sync button on the board toolbar has no visual indicator that local ticket changes exist. After creating, moving, or editing tickets, the user has no way to know at a glance whether their work has been synced to the remote. They must remember to sync manually with no prompt from the UI.

## Solution

Show a small yellow dot badge on the sync button whenever there are local changes that haven't been pushed. The dot appears immediately when files change and clears after a successful sync. A WebSocket channel pushes the dirty state from the server to the client in real time, so the indicator stays current without polling or full board revalidation.

## Implementation Decisions

### Yellow dot badge

- A small yellow dot badge renders at the top-right corner of the sync button, in the same position as the existing conflict "!" badge.
- No text inside the dot, just a filled circle.
- The conflict badge takes priority: when a conflict is active, show the "!" badge and hide the yellow dot.
- The dot shows regardless of whether a remote is configured. It signals "you have local changes," not "you should sync."

### Board events WebSocket

- A new WebSocket endpoint at `/api/projects/:projectSlug/board/events` serves as a general-purpose board events channel.
- On connect, the server checks whether the worktree has unpushed commits (`git rev-list @{u}..HEAD --count`). If the upstream is missing (no tracking branch / never pushed), that also counts as pending. The server sends the initial `hasPendingChanges` value immediately.
- The file watcher signals `hasPendingChanges: true` over the WebSocket on any file change event, before the auto-commit debounce completes. This makes the dot appear instantly when the user edits anything.
- After a successful sync, the sync route signals `hasPendingChanges: false` over the WebSocket.

### Client WebSocket lifecycle

- The client opens the WebSocket when the project board mounts.
- When the user navigates to a different project (`projectSlug` changes), the client closes the old connection and opens a new one. The server sends the initial state on connect, so the dot is immediately correct for the new project.
- Standard reconnect with exponential backoff on connection loss, same pattern as the old heartbeat client.

### Modules

- Board event hub (server): a service that manages WebSocket connections per worktree directory and provides a `notify(worktreeDir, event)` method. Registered in the service container.
- Board events route: handles the WebSocket upgrade and connects to the event hub.
- File watcher modification: after detecting a file change, call the event hub to push `hasPendingChanges: true`.
- Sync route modification: after a successful sync, call the event hub to push `hasPendingChanges: false`.
- Board events client: a client-side module that opens the WebSocket and exposes a reactive signal. Same reconnect pattern as the old heartbeat client.
- Sync button modification: read the signal from the board events client and render the yellow dot badge.

### Tests

- Board event hub: unit tests for connection management and notification dispatch.
- File watcher integration: verify that file changes result in `hasPendingChanges: true` being sent.
- Sync button rendering: e2e test that the yellow dot appears and disappears based on pending state.

## Out of Scope

- Checking whether the remote has changes the user hasn't pulled (no periodic fetch).
- Showing the count of pending changes or any detail beyond the dot.
- Any changes to the sync button's existing behavior (syncing, success checkmark, conflict badge).
- Revalidating the full board data in response to file changes.

## Further Notes

- The old heartbeat WebSocket (removed in the Electron migration) used a similar pattern: client connects, server tracks peers, reconnect with exponential backoff. The board events client can follow the same structure but scoped to a project and carrying typed event payloads instead of ping/pong.
- The WebSocket endpoint is named generically (`board/events`) so it can carry other event types in the future without adding more connections.
