# Error propagation refactoring plan

Migrate each flow from origin to display in the same batch. Preserve error information and run affected tests per batch. Mark completed items with [x].

- [x] Shared foundation
  - [x] Add the user-facing error type.
  - [x] Add the shared toast queue and debug menu.
  - [x] Add field matching, full-error dialog, and presentation routing.
- [x] Simple flows: appearance and settings saves.
- [x] Forms: project/ticket creation and validation.
- [x] Ticket operations: editing, files, uploads, cleanup.
- [x] Launching and sync: commands, worktrees, conflicts.
- [x] Background flows: polling and review delivery.
- [x] Check error-map.md for remaining producers and consumers using the old flow.

## Verification

- Selected existing unit, component, server, and real-server UI tests passed after updating their error contracts and presentation expectations.
- Field-error details, dialog dismissal, duplicate-name correction, raw-file failures, saved-state failures, and review delivery were checked.
- Existing stored review errors are converted when read; new errors retain their structured payload.
- Formatter, TypeScript checking, and the full suite were not requested.
