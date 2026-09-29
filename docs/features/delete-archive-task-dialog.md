# Delete and archive task dialog

A dialog for archiving or deleting a task, with optional cleanup actions and confirmations.

## Specifications

- `S1` Every destructive operation offered by the delete and archive task dialog requires explicit confirmation in a confirmation dialog before it runs.
- `S2` The dialog offers cleanup action buttons for deleting task worktrees, deleting task branches, and stopping task agents.
- `S3` Each cleanup button is disabled when its operation has no target.
- `S4` Each enabled cleanup button can be clicked to perform its action.
- `S5` Each cleanup button is blocked when a check has found an issue.
- `S6` Each cleanup item can have an error status.
