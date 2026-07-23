# Goal

Make project and Forest interactions responsive by separating fast board reads from slow Git sync and conflict checks.

# Problem

`ProjectPageService.loadProjectPage()` combines registry lookup, ticket loading, worktree checks, and Git sync status. Commit `9baeb3a` changed conflict detection from a cheap filesystem check to `detectConflict()`, which can run several Git commands on every project-page load or revalidation.

This oversized query is currently used by initial project loading and 19 production refresh paths. Some UI flows await it before showing or closing visible UI:

- Initial project loading waits for Git before rendering the project page.
- A sync conflict waits for a full project refresh before opening the conflict dialog.
- Forest group creation waits for a full project refresh before closing its dialog.
- Forest dependency deletion waits for a full project refresh before closing its popup.
- Active conflict state polls the full project page every five seconds.

Other ticket edits, reorders, and Settings closure trigger the same expensive query in the background.

# Scope

1. Split the fast project/board read model from Git remote and conflict status.
2. Render the project page without waiting for Git status.
3. Poll only a lightweight sync-status resource while conflict handling is active.
4. Open the conflict dialog immediately when Sync reports a conflict.
5. Make Forest mutation dialogs and popups close after the mutation succeeds without awaiting a broad project refresh.
6. Replace broad `project-page` revalidations with targeted refreshes or local optimistic updates.
7. Remove redundant config revalidate-then-fetch sequences where practical.

# Acceptance criteria

- Opening an already configured project displays its board within 500 ms without waiting for any Git command.
- Project/board loading does not call `hasRemote()` or `detectConflict()`.
- Git sync status loads independently and cannot hide or replace the project-page shell.
- After Sync returns a conflict result, the conflict dialog appears within 500 ms.
- Forest group creation and dependency deletion close their transient UI immediately after successful persistence; Git status refresh continues independently.
- Conflict polling never revalidates the full project page.
- Regression tests use stalled Git/status promises to prove that project rendering and transient UI remain responsive.
- Existing sync, conflict-resolution, board, ticket, and Forest behavior remains covered and passing.
