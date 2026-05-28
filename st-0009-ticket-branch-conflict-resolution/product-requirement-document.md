## Problem Statement

When working in a team or across multiple machines, the ticket branch (orphan branch `ai-stages`) can diverge between local and remote. There is no way to push local ticket changes or pull remote ones. If both sides change, there is no mechanism to detect or resolve conflicts. Users must manually run git commands in the ticket worktree to stay in sync.

## Solution

Add a Sync button to the board toolbar that commits local ticket changes, rebases on the remote ticket branch, and pushes. When the rebase produces merge conflicts, offer to launch Claude to resolve them automatically. Make the conflict resolution prompt and coding agent profile configurable in the Settings dialog.

## User Stories

1. Clicking the Sync button in the board toolbar (next to the settings gear) commits all uncommitted ticket worktree changes, fetches the remote, rebases on the tracking branch, and pushes.
2. The Sync button is hidden entirely when the ticket branch (`ai-stages--{slug}`) has no remote tracking branch configured.
3. While a sync operation is in progress the Sync button is disabled. On success it swaps to a check icon (same dimensions as the sync icon) that reverts after a short delay.
4. When there are no local changes and the branch is already up to date with remote, clicking Sync shows the success check icon without any dialog or error.
5. Ticket mutations (create, update, delete, archive, reorder, stage markdown edits, file add/remove, reference changes) no longer auto-commit. Changes stay as uncommitted modifications in the worktree until the next Sync.
6. When the rebase step encounters merge conflicts, the server returns a conflict status and the UI shows a confirmation dialog with two options: "Resolve with Claude" and "Abort".
7. Choosing "Abort" runs `git rebase --abort`, leaving the local commit in place so the user can retry later.
8. Choosing "Resolve with Claude" launches Claude via the selected Coding Agent Profile, running in the ticket worktree directory, with the conflict resolution prompt as the initial prompt. Claude resolves all conflict markers, runs `git add` and `git rebase --continue` for each conflicting commit, then pushes.
9. The conflict resolution prompt is a plain text field (no placeholder interpolation) on the Settings dialog General tab, stored as `conflictResolutionPrompt` in LauncherConfig.
10. The Coding Agent Profile used for conflict resolution is selectable via a dropdown on the Settings dialog General tab, stored as `conflictResolutionProfileName` in LauncherConfig.
11. Both fields have defaults: the prompt defaults to a pre-written instruction covering conflict resolution, rebase continuation, and push; the profile defaults to the platform-appropriate profile (Claude Win / Claude macOS).
12. After any successful sync -- whether conflict-free or after Claude finishes -- the board reloads via `revalidate("board-data")` to reflect remote changes.

## Implementation Decisions

1. Remove auto-commit on every ticket change. The TicketStore and TicketOrderStore currently call autoCommit after every mutation (11 call sites). All of these are removed. Changes remain as uncommitted modifications in the ticket worktree until the user syncs.

2. The Sync button goes in the board header toolbar, near the settings button. It has three visual states: idle (sync icon), syncing (disabled), success (check icon). The check icon reverts to the sync icon after a short delay. Both icons are the same size.

3. The Sync button is hidden when the ticket branch has no remote tracking branch. The server checks for a tracking branch and reports this to the UI.

4. Sync flow: commit all local changes with `git add -A` and `git commit`, fetch the remote, rebase on the remote tracking branch, push. If there is nothing to commit and the branch is up to date, show success silently.

5. On rebase conflict, the server returns a conflict status. The UI shows a confirmation dialog: "Resolve with Claude?" or "Abort". Abort runs `git rebase --abort`, leaving the local commit in place.

6. "Resolve with Claude" launches Claude via the user-selected coding agent profile, running in the ticket worktree directory. The conflict resolution prompt is passed as the initial prompt. Claude handles everything: resolve conflict markers, git add, git rebase --continue (repeating for multiple conflicts), then push.

7. Two new fields in LauncherConfig: `conflictResolutionPrompt` (string) and `conflictResolutionProfileName` (string or null). Stored and loaded like `worktreeRootPath`. The default prompt is: "This is a ticket management worktree with an in-progress git rebase that has merge conflicts. Resolve all conflicts in the affected files, keeping the intent of both sides where possible. For status.json files prefer the version with the more recent data. After resolving each conflict, stage the files and run git rebase --continue. Repeat until the rebase completes. Then push to remote."

8. The Settings dialog General tab gets two new fields below the existing worktree root path: a plain text area for the conflict resolution prompt and a dropdown for the coding agent profile. The prompt has no placeholder interpolation.

9. After any successful sync (conflict-free or after Claude finishes), the board reloads via `revalidate("board-data")`.

10. The conflict resolution dialog follows existing dialog patterns (fixed overlay, card, Cancel/Resolve buttons).

## Modules

1. TicketSyncManager (new, server-side): orchestrates commit, fetch, rebase, push. Detects conflicts. Checks for remote tracking branch existence. Simple interface: `sync(worktreeDir)` returning success, conflict, or error. `hasRemote(worktreeDir)` returning boolean. `abort(worktreeDir)` running `git rebase --abort`.

2. Conflict resolution launcher (server-side): reuses the existing agent launch flow to run Claude with the conflict resolution prompt in the ticket worktree. Thin adapter over existing launchAgent infrastructure.

3. LauncherConfig extension: two new fields in the config type and manager. Default prompt provided. Read/write through existing config load/save paths.

4. Settings General tab UI: prompt textarea and profile dropdown added below existing worktree root path field.

5. Sync button (board toolbar UI): three visual states with icon swap on success.

6. Conflict dialog (UI): confirmation dialog with two actions following existing dialog patterns.

7. autoCommit removal: strip all autoCommit calls from TicketStore and TicketOrderStore.

## Testing Decisions

Each module gets up to 2 focused tests covering external behavior. Tests use the existing patterns: temporary git directories with cleanup, vitest, vi.spyOn for side effects. UI tests use Playwright with mocked file system and process calls.

1. TicketSyncManager: (a) sync with no conflicts commits, rebases, and pushes successfully; (b) sync that hits a conflict returns conflict status and abort restores the pre-rebase state.

2. Conflict resolution launcher: (a) launches Claude with the conflict resolution prompt in the correct working directory; (b) uses the configured profile from LauncherConfig.

3. LauncherConfig extension: (a) default conflict resolution prompt is provided when no config exists; (b) saved conflictResolutionPrompt and conflictResolutionProfileName round-trip through load/save.

4. Settings General tab UI: (a) prompt textarea and profile dropdown render with current values; (b) editing and saving the prompt persists to config.

5. Sync button UI: (a) button is hidden when no remote tracking branch exists; (b) button shows check icon after successful sync and reverts.

6. Conflict dialog UI: (a) dialog appears on conflict with Resolve and Abort options; (b) choosing abort triggers rebase abort and dismisses dialog.

7. autoCommit removal: (a) creating/updating a ticket does not produce a git commit; (b) ticket changes survive as uncommitted files in the worktree.

## Out of Scope

- Remote tracking branch setup during project registration
- Worktree recovery when the ticket worktree directory is corrupted with uncommitted changes
- Push/pull for the project's main branch
- Real-time or automatic sync (polling, webhooks)
- Conflict resolution without Claude (manual editing)

## Further Notes

The Sync and Conflict Resolution terms have been added to CONTEXT.md as part of this PRD work.
