# ST-0013: Launch Other Apps from the Ticket Launcher

## Problem

Users want to launch external applications (editors, browsers, file managers, custom scripts) in the context of a ticket, not just Claude Code. Currently the Agent Launcher only supports launching coding agent profiles with prompt assembly. There is no way to define and run simple commands with ticket placeholders.

## Solution

Add Shortcuts to the launcher system. A Shortcut is a named command string with Placeholders that runs directly -- no prompt assembly, no template/skill selection. Shortcuts are configured in Launcher Config at app or project scope, managed in Settings, and launched from the Agent Launcher tab.

## Requirements

1. Data model: Add a `LauncherShortcut` type with `name` and `command` fields. Add `shortcuts` array to `LauncherConfig` and `MergedLauncherConfig` (with scope tag). Shortcuts merge the same way as templates/skills/profiles (project overrides app on name collision).

2. Server: `LauncherConfigManager` gets CRUD methods for shortcuts (add, update, remove) following the same pattern as templates/skills/profiles. `parseConfig` and `getMergedConfig` handle the new field. Default app config ships with no shortcuts.

3. API routes: Add shortcut CRUD endpoints at both scopes:
   - `POST/PUT/DELETE /api/launcher-config/shortcuts`
   - `POST/PUT/DELETE /api/projects/[slug]/launcher-config/shortcuts`

4. Shortcut execution: Add `POST /api/projects/[slug]/board/tickets/[folderName]/shortcut/run` that accepts `{ name: string }`, looks up the shortcut by name in merged config, interpolates all ticket placeholders in the command string, and spawns the process with `cwd` set to the project path. Available placeholders: `ticketDir`, `ticketSlug`, `ticketTitle`, `ticketNumber`, `ticketStatus`, `projectPath`, `projectSlug`, `launchDir`. The `launchDir` value equals the project path (shortcuts do not use agent worktrees).

5. UI - Agent Launcher: Show shortcuts as a row of buttons above the agent launch form. Each button shows the shortcut name and runs it on click. Show a disabled state while launching. Show errors via the existing ErrorDialog.

6. UI - Settings: Add a "Shortcuts" tab in LauncherSettings. Same add/edit/delete/scope UI pattern as the existing Prompts/Skills/Launch tabs. The form shows Name and Command fields. The placeholder hint shows the ticket placeholders (same as templates, plus `launchDir`).

## Out of scope

- Keyboard shortcuts / hotkeys for shortcuts
- Shortcut output capture or display
- Worktree support for shortcuts (always runs in project dir)
- Per-column default shortcuts
