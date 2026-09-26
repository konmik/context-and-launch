# Configuration and persisted-state data flow

Scope: the nine mutable file-backed data sources and the explicit palette/theme preferences listed in `description.md`.

## Verified implementation

- App config, shared/project launcher config, boards, command-template overrides, and Diff Review use `createStoredConfig`, which implements `StoredSignal` using the shared `createStoredState` queue.
- Ticket order, Forest layout, ticket-detail state, and appearance use `createStoredSignal`.
- Each has a Solid context provider. Provider locations and actual lifetimes are recorded in `description.md`; a project-backed file does not necessarily have a project-wide client provider.
- `StoredSignal` exposes `get`, `update`, and `refresh`. Updates queue sequentially and publish successful persisted results; consumers handle save errors.

## Preserve domain-specific persistence

- `createStoredConfig` reads with an internally generated owner, transforms the latest value, saves serialized JSON, and releases the owner in `finally`. Preserve the existing server validation, locking, and atomic-write boundaries.
- Ticket order and Forest layout read current state and submit both expected and next values; their stores reject a changed expected value.
- Ticket-detail updates submit previous/next `TicketInfo`. `saveTicketStatus` applies changed fields and reference deltas to the latest ticket under `mutateTicketsExclusive`; it is not a whole-file expected-state comparison.
- Appearance updates read and write the selected localStorage keys and publish through `AppearanceContext`; the root applies the palette/mode and notifies Electron.

## Preserve launcher semantics

- Store raw shared and project launcher configurations separately; derive merged views rather than persisting them.
- Preserve extra JSON fields, item ordering, duplicate-name checks, and rename/delete reference handling.
- Preserve existing precedence: project entries override same-named shared entries; column defaults, worktree root, and branch prefix come from project config; the conflict-resolution prompt falls back to shared config.

## Completion audit

- [x] Reviewed shared-state consumers and derived launcher views; the superseded merged-config cache is absent.
- [x] Verified navigation isolation through project-store tests and browser navigation scenarios; reviewed explicit refresh paths and mounted-view lifetimes.
- [x] Audited retained domain writers and refresh paths. Ticket dependency/group operations revalidate ticket data, group operations refresh layout, and ticket detail refreshes on worktree revisions.
- [x] Verified failure handling, queue recovery, lease conflicts/release, and order/layout expected-state conflicts in the passing unit/integration suite.
- [x] Verified launcher precedence/reference handling and appearance isolation through unit and browser tests.
- [x] Resolve the final audit's Diff Review E2E failure: isolated the stalled composer updates to periodic async agent-status refresh. Publish completed status reads through `createStoredState`; retain polling and explicit refresh after send/retry. All 13 existing Diff Review browser scenarios pass with unchanged assertions.
- [ ] Finish full E2E verification and commit the audit fixes and test cleanup.

Detailed findings, test cleanup, and the final browser-run result are recorded in `audit.md`.
