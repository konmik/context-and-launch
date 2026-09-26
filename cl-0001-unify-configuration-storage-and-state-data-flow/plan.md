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

## Remaining completion audit

- [ ] Check migrated consumers for duplicate writable snapshots and stale caches; successful updates should reach consumers sharing the relevant provider.
- [ ] Check refresh and navigation behavior at the actual provider lifetimes, especially project changes and externally changed ticket state.
- [ ] Audit retained domain actions and server writers against their persistence boundaries. In particular, ticket dependency/group actions still write `status.json` outside the ticket-detail store; verify how those changes reach mounted consumers before calling that row fully migrated.
- [ ] Verify failure handling and queue recovery, configuration lease conflicts/release, and expected-state conflicts for order/layout using the relevant existing tests.
- [ ] Verify launcher precedence/reference handling and appearance preference isolation remain intact.

Completion means the scoped data flow is consistent and the remaining audit is resolved; the existence of a store/context alone is not a completion claim.
