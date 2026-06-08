## Problem Statement

Users working on a ticket often need to open external tools against the ticket's branch: an IDE at the project root, a diff viewer, a terminal in the worktree, or a custom script. Today they must manually navigate to the correct directory and run these commands themselves. The Agent Launcher only supports launching Claude Code with prompt assembly -- there is no way to configure and one-click-launch arbitrary external applications from the ticket context.

## Solution

Introduce Shortcuts -- named commands that launch external applications against a ticket's context with a single click. Users configure Shortcuts in Settings (at app or project scope), then launch them from a new Shortcuts layer in the Ticket Detail Dialog. Shortcuts reuse the existing placeholder system for interpolation and the existing process-spawn infrastructure for execution and error reporting.

## Requirements

### Domain model

1. Shortcut is a new domain concept: a named command that launches an external application against a ticket's context. Structure: `{ name: string, command: string }`. No prompt assembly -- the command runs directly after placeholder interpolation.
2. The Shortcut concept is added to CONTEXT.md glossary with avoid terms: app, tool, quick launch.

### Config storage

3. Add `shortcuts: LauncherShortcut[]` to `LauncherConfig` alongside templates, skills, and profiles.
4. Add `shortcuts` with scope annotations to `MergedLauncherConfig`.
5. Shortcuts get app-level vs project-level scoping and additive merge behavior (project wins on name collision) -- same as templates, skills, and profiles.

### New placeholder

6. Add `{{launchDir}}` placeholder that resolves to `projectPath` when the worktree toggle is off, or the agent worktree path when the toggle is on.
7. `{{launchDir}}` is available in Templates, Skills, and Shortcuts -- not restricted to Shortcuts only.

### Settings UI

8. Add a fifth tab "Shortcuts" after "Launch" in the Settings dialog.
9. Same CRUD pattern as the other tabs: list with Edit/Delete buttons, Add button, form with name field and command textarea.
10. Scope selection (User/Project) on add, scope badge on edit.
11. Placeholder help text shows the Template placeholder set plus `{{launchDir}}`.

### Ticket Detail Dialog layers

12. Add a third layer "Shortcuts" alongside File Editor and Agent Launcher.
13. The layer switcher accommodates three options.
14. `lastLayer` type expands to `"editor" | "launcher" | "shortcuts"`.
15. No per-column defaults are stored for Shortcuts beyond `lastLayer`.

### Worktree toggle position

16. Lift the "Launch in worktree" toggle out of the AgentLauncher component and into the TicketDetailDialog, above all three layers.
17. Same visibility rule: only shown when `worktreeRootPath` is configured in the merged launcher config.
18. Same persistence: PUT to the use-worktree endpoint on change.
19. AgentLauncher receives `useWorktree` as a prop instead of managing it internally.

### Shortcuts layer UI

20. Show a flat list of all merged shortcuts (app + project scope) with a ">" run button next to each.
21. All merged shortcuts are shown regardless of OS. No platform filtering.
22. No duplicate-window check for shortcuts -- the same shortcut can be launched multiple times.

### Launch mechanism

23. Extract the shared parts of the process-spawn infrastructure from agent-launch into a common function: command parsing, spawn with stdio, 3-second unref window, exit code checking, ProcessError creation.
24. The shortcut launch path uses this common function. It skips prompt assembly and the duplicate-window check.
25. Working directory is set to `launchDir` (projectPath or agent worktree path depending on the toggle).
26. The branch-behind-remote check still applies when launching in a worktree.

### API routes

27. New CRUD endpoints for shortcuts at both scopes, following the existing pattern:
    - `POST/PUT/DELETE /api/launcher-config/shortcuts` (app scope)
    - `POST/PUT/DELETE /api/projects/{slug}/launcher-config/shortcuts` (project scope)
28. New launch endpoint for shortcuts:
    - `POST /api/projects/{slug}/board/tickets/{folderName}/shortcuts/run` with body `{ shortcutName: string, useWorktree: boolean }`

### Error handling

29. Same error dialog as agent launch. Only catches spawn failures and immediate non-zero exit codes within the 3-second window.
30. Long-lived GUI applications (IDEs, terminals) that crash after startup are not intercepted -- this is inherent to the fire-and-forget model.

## Testing Decisions

Tests should verify external behavior through the module's public interface, not implementation details. A good test sets up realistic inputs, calls the public function or interacts with the UI, and asserts on the observable output or state change.

### Server-side unit tests

Launcher Config Manager shortcuts CRUD and merge: follow the existing pattern in `launcher-config.test.ts`. Test add, update, remove at both scopes. Test merge behavior (project overrides app on name collision). Test that removal does not cascade to column defaults (shortcuts have none). Use temp directories for isolation.

Prompt interpolation with `{{launchDir}}`: add cases to `prompt-interpolation.test.ts` verifying that `launchDir` is interpolated in templates, skills, and shortcut commands.

Shortcut launch: test the extracted spawn function with a known-good command (e.g. a script that exits 0) and a known-bad command (exits non-zero). Verify ProcessError is thrown on failure. Verify fire-and-forget resolves after the timeout window.

### E2E tests with Playwright

Settings Shortcuts tab: open Settings, switch to Shortcuts tab, add a shortcut, verify it appears in the list with correct scope badge, edit it, delete it.

Shortcuts layer in ticket dialog: open a ticket, switch to Shortcuts layer, verify the list shows merged shortcuts, click a run button. Mock the server-side process spawn to verify the correct API call is made with the right parameters.

Worktree toggle above layers: verify the toggle is visible when worktreeRootPath is configured, verify it persists across layer switches, verify it is hidden when worktreeRootPath is null.

Prior art for test patterns: `e2e/board-crud.test.ts` for Playwright patterns with mock server, `src/server/launcher-config.test.ts` for config CRUD testing.

## Out of Scope

- Default shortcuts shipped with the app (users configure their own)
- Platform-specific filtering or OS detection for shortcuts
- Icon or image configuration for shortcuts
- Keyboard shortcuts or hotkeys for launching
- Shortcut categories or grouping
- Drag-and-drop reordering of shortcuts
- Shortcut output capture or display (fire-and-forget only)
- Shortcut execution history or logging

## Further Notes

The `{{launchDir}}` placeholder is the only net-new interpolation variable. All other placeholders (`{{ticketDir}}`, `{{projectPath}}`, etc.) already exist and are reused as-is.

The worktree toggle lift is a structural change to TicketDetailDialog that affects the AgentLauncher component: it must accept `useWorktree` as a prop instead of managing it internally.
