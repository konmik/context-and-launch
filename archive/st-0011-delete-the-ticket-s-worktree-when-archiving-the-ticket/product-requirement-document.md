# ST-0011: Archive Ticket with Worktree Cleanup

## Problem Statement

When tickets are completed or abandoned, they clutter the kanban board with no way to remove them non-destructively. The existing "Delete" option permanently destroys the ticket folder, but in neither case does the system clean up the associated agent worktree and git branches -- leaving orphaned directories and branches accumulating on disk.

## Solution

Add an "Archive" action that moves tickets to cold storage (invisible to the board) and a worktree cleanup dialog that appears on both Archive and Delete, letting the user choose which git artifacts to remove. The entire operation is atomic -- any failure aborts everything and leaves the system unchanged.

## User Stories

1. As a user, I want to archive a completed ticket so that my board only shows active work
2. As a user, I want archived tickets preserved on disk so that I can manually restore them if needed
3. As a user, I want to delete the agent worktree when archiving so that disk space is reclaimed
4. As a user, I want to delete the local branch when archiving so that my branch list stays clean
5. As a user, I want to delete the remote branch when archiving so that the remote repository stays clean
6. As a user, I want granular checkboxes for each cleanup option so that I can choose exactly what to remove
7. As a user, I want my checkbox selections remembered across dialogs so that I don't re-select every time
8. As a user, I want the operation to abort if my worktree has uncommitted changes so that I don't lose work
9. As a user, I want the operation to abort if any checked cleanup step fails so that I end up in a consistent state
10. As a user, I want a clear error message when the operation fails so that I know what to fix
11. As a user, I want the delete action to also offer worktree cleanup so that deletion is no longer a silent data leak
12. As a user, I want the dialog to not close on failure so that I can read the error and retry
13. As a user, I want archive and delete to work without a dialog when there is no worktree so that the flow is fast for simple tickets

## Implementation Decisions

- Archive moves the ticket folder into an `archive/` subfolder within the project's tickets worktree. The server's `listTickets()` skips this directory entirely -- it is not a ticket folder.
- No UI for browsing or restoring archived tickets. Restore is a manual filesystem operation.
- The archive operation auto-commits the move to the `ai-stages` orphan branch, consistent with how delete auto-commits today.
- A new WorktreeCleanupService encapsulates the atomic cleanup logic. Its interface: `cleanup(projectPath, folderName, options) → void | throws`. It validates all preconditions before executing any destructive operations.
- Precondition validation happens up front: if "delete worktree" is checked, the worktree must be clean; if "delete remote branch" is checked, the remote branch must exist. Violations throw before any mutation occurs.
- Execution order: git cleanup (worktree remove, local branch delete, remote branch delete) runs first, then ticket archive/delete, then auto-commit. Git operations are the most failure-prone, so they go first.
- The cleanup dialog shows three checkboxes: delete worktree, delete local branch, delete remote branch. Selections persist in localStorage under a fixed key.
- The dialog only appears when the ticket has `useWorktree: true` and the agent worktree actually exists on disk. Otherwise archive/delete proceeds immediately.
- The existing Delete operation gains the same cleanup dialog and atomic semantics. Its core behavior (permanent folder removal via `rmSync`) is unchanged.
- AgentWorktreeManager gains query methods (`isWorktreeClean`, `hasRemoteBranch`) and destructive methods (`removeWorktree`, `deleteLocalBranch`, `deleteRemoteBranch`).

## Testing Decisions

Tests should verify external behavior through the public interfaces of each module, not internal implementation details.

Modules to test:

- WorktreeCleanupService -- the critical deep module. Test cases: all preconditions pass and cleanup succeeds; dirty worktree with delete-worktree checked throws and changes nothing; missing remote with delete-remote checked throws and changes nothing; partial options (only some checkboxes) execute only the selected operations.
- TicketStore (extended) -- `archiveTicket()` moves the folder into `archive/`, `listTickets()` ignores the `archive/` directory.
- AgentWorktreeManager (extended) -- the new query/destructive methods operate correctly against real git repos.

Prior art: existing tests in `ticket-store.test.ts` and `agent-worktree.test.ts` use vitest with real temp directories and real git repos (no mocks for filesystem/git). New tests should follow the same pattern.

## Out of Scope

- Browsing or restoring archived tickets from UI
- Bulk archive
- Auto-archiving based on status or time
- Force-removing dirty worktrees
- Undo/rollback UI

## Further Notes

The `archive/` folder lives inside the tickets worktree (which is on the `ai-stages` orphan branch). This means archived tickets are version-controlled -- the move is committed, and `git log` shows when tickets were archived. This is intentional: it provides an audit trail without any extra infrastructure.
