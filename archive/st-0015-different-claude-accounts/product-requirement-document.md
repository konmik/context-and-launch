# ST-0015: Coding Agent Profiles

## Problem Statement

The Agent Launcher hardcodes how Claude is launched: a Windows-only `.bat` file running `claude --dangerously-skip-permissions`, spawned in Windows Terminal, with the initial prompt delivered via `WScript.Shell.SendKeys`. This means:

- Users cannot run Claude with different accounts or configurations depending on the project or ticket
- Users cannot run Claude inside a sandbox
- The launch mechanism is Windows-only, with no macOS support
- Changing how Claude is invoked requires modifying application source code

## Solution

Introduce Coding Agent Profiles: named command strings that control how Claude is launched from the Agent Launcher. Each profile defines a command that the server executes with fixed parameters appended (`initialPrompt`, `ticketTitle`). The app ships with two default profiles ("Claude Win" and "Claude macOS") backed by user-editable platform scripts (`run-agent.ps1`, `run-agent.sh`) stored in `~/.ai-stages/`. Users select a profile from a dropdown in the Agent Launcher, and the selection is remembered per column.

## User Stories

1. As a user with multiple Claude accounts, I want to select which account to use when launching an agent, so that I can use my personal account for side projects and my work account for company tickets
2. As a user, I want to run Claude inside a sandbox, so that I can limit what the agent can access on my machine
3. As a macOS user, I want to launch Claude from the Agent Launcher, so that I am not limited to Windows
4. As a user, I want the Agent Launcher to remember which profile I last used for each column, so that I do not have to reselect it every time
5. As a user, I want to define profiles at the global level, so that they are available across all projects
6. As a user, I want to define profiles at the project level, so that I can override or add profiles specific to a project
7. As a user, I want to manage profiles in the Settings dialog, so that I can add, edit, and delete profiles with scope badges showing whether they are global or project-scoped
8. As a user, I want the profile dropdown to always be visible in the Agent Launcher, so that I can see and change the selected profile at any time
9. As a user, I want to edit the platform scripts (`run-agent.ps1`, `run-agent.sh`) to customize terminal behavior, so that I can tailor the launch experience without modifying app source code
10. As a user, I want the app to ship working default profiles for both Windows and macOS, so that I can launch agents immediately without any configuration
11. As a user, I want my custom script edits to survive app updates, so that the app only writes the default scripts if they do not already exist

## Implementation Decisions

### Coding Agent Profile data model

A Coding Agent Profile has two fields: `name` (string) and `command` (string). The command is the full invocation string. The server parses the command, appends `-initialPrompt` and `-ticketTitle` as spawn arguments, and executes the result in the worktree directory (or project directory if no worktree is selected).

### Default profiles and platform scripts

The app ships two default profiles in the app-level launcher config:

- "Claude Win" with command `powershell -File run-agent.ps1`
- "Claude macOS" with command `bash run-agent.sh`

The scripts `run-agent.ps1` and `run-agent.sh` are written to `~/.ai-stages/` on first config load, only if they do not already exist. They are user-editable and not overwritten on subsequent launches or updates.

Each script is responsible for: opening a terminal, setting the window title (derived from `ticketTitle`), launching `claude --dangerously-skip-permissions`, and delivering the initial prompt. On Windows, prompt delivery uses the existing `SendKeys` approach. On macOS, it uses AppleScript with System Events.

### Scoping and merge semantics

Coding Agent Profiles follow the same Global/Project dual-scope system as Templates and Skills. Profiles are stored in the `profiles` array of `LauncherConfig`. During merge, project-scoped profiles override app-scoped profiles on name collision, and each profile is annotated with `scope: "app" | "project"`.

### Per-column defaults

`LauncherColumnDefaults` gains a `profileName` field. The selected profile is saved per column alongside `templateName` and `checkedSkills` after each successful launch.

### Agent launch refactor

The current hardcoded launch logic (bat file generation, `wt` spawn, `SendKeys`) is replaced by profile-based execution. The server reads the selected profile's command, parses it into executable and arguments, appends the two fixed parameters, and spawns the process in the correct working directory.

`LaunchRequest` gains a `profileName` field sent by the Agent Launcher UI.

### API routes

Profile CRUD endpoints are added at both scopes, mirroring the existing template/skill pattern:

- App-scope: `POST/PUT/DELETE /api/launcher-config/profiles`
- Project-scope: `POST/PUT/DELETE /api/projects/[slug]/launcher-config/profiles`

### Settings dialog

The "Launcher Settings" dialog is renamed to "Settings." Tab navigation is added. The existing Templates, Skills, and worktree root path sections remain in one tab. A new tab is added for managing Coding Agent Profiles, using the same add/edit/delete form and scope badge UI pattern.

### Agent Launcher UI

An always-visible dropdown for selecting a Coding Agent Profile is added to the Agent Launcher, following the same pattern as the template dropdown. It is pre-populated from per-column defaults on load.

## Testing Decisions

Tests should verify external behavior through the public interfaces of each module. The existing test suite in this codebase is thorough and provides good prior art for the patterns to follow.

### LauncherConfigManager (unit tests)

Profile CRUD methods, merge semantics with scope annotation, name collision resolution between app and project scopes, `saveColumnDefaults` with `profileName`. Follow the patterns in `src/server/launcher-config.test.ts` which already covers the equivalent template/skill operations.

### Agent launch (unit tests)

Profile command parsing and parameter appending, working directory selection (worktree vs project), `LaunchRequest` parsing with `profileName`. Follow patterns in `src/server/agent-launch.test.ts`.

### API routes

Profile CRUD endpoints at both scopes. Follow patterns in the existing route tests.

## Out of Scope

- Placeholder interpolation in the command string (parameters are passed as spawn arguments only)
- Migration logic for updating shipped scripts after app updates
- Cross-platform auto-detection (user selects the right profile for their OS)
- Linux support (only Windows and macOS scripts are shipped)
- Multiple simultaneous agent launches from the same ticket

## Further Notes

- The `run-agent.sh` macOS script needs to handle prompt delivery via AppleScript with System Events, which requires the target application to be in the foreground. This is a known limitation.
- The CONTEXT.md glossary should be updated to add the Coding Agent Profile definition and rename "Launcher Settings" to "Settings."
