Create unified storage and data flow for config files and their state.

## Config files

Paths are relative to `~/.context-launch/`, unless otherwise stated. `CONTEXT_LAUNCH_DATA_DIR` can override this root.

### Global

- `config/config.json` - Project Registry and app settings.
- `config/launcher-config.json` - Shared launcher settings, templates, skills, profiles, shortcuts, and column defaults.
- `config/boards.json` - Board definitions and columns.
- `config/command-templates.json` - Overrides of built-in shell command templates.

### Per project

- `projects/{projectSlug}/config/launcher-config.json` - Project launcher settings and overrides.
- `projects/{projectSlug}/config/diff-review.json` - Per-ticket reviewed-line state and review-prompt queues.
- `{ticketsPath}/ticket-order.json` - Ticket ordering within columns.
- `{ticketsPath}/forest-layout.json` - Ticket positions in Forest View.

`ticketsPath` defaults to `projects/{projectSlug}/tickets/` and can be customized in the Project Registry.

### Per ticket

- `{ticketsPath}/{ticketFolder}/status.json` - Ticket metadata, status, references, dependencies, group membership, and agent-worktree settings.
- `config/running/{projectSlug}/{ticketFolder}.json` - Runtime agent marker.

### Other persisted settings

- `{Electron userData}/window-state.json` - Desktop window and session restore state.
- Browser/Electron `localStorage` - UI preferences and viewport state; not a standalone config file.

### Bundled defaults in the application repository

- `config-defaults/config.json`
- `config-defaults/launcher-config.json`
- `config-defaults/project-launcher-config.json`
- `config-defaults/boards.json`
- `config-defaults/command-templates.json`

## Current refactoring state

| JSON file path/name | Current refactoring state |
| --- | --- |
| `config/config.json` | Uses `StoredSignal` through `createAppConfigStorage` → `createStoredConfig`, with owner-lease read/save/release updates. |
| `config/launcher-config.json` | Uses `StoredSignal` through `createSharedLauncherConfigStorage` → `createStoredConfig`, with owner-lease read/save/release updates. |
| `config/boards.json` | Uses `StoredSignal` through `createBoardConfigStorage` → `createStoredConfig`, with owner-lease read/save/release updates. |
| `config/command-templates.json` | Uses `StoredSignal` through `createCommandTemplateStorage` → `createStoredConfig`, with owner-lease read/save/release updates. |
| `projects/{projectSlug}/config/launcher-config.json` | Uses `StoredSignal` through `createProjectLauncherConfigStorage` → `createStoredConfig`, with owner-lease read/save/release updates. |
| `projects/{projectSlug}/config/diff-review.json` | Uses `StoredSignal` through `createStoredConfig` in `DiffReview.tsx`, with owner-lease read/save/release updates. |
| `{ticketsPath}/ticket-order.json` | Uses `createStoredSignal` through `createTicketOrderStorage`; persistence reads the current order and submits current/next values, rather than using `createStoredConfig`. |
| `{ticketsPath}/forest-layout.json` | Uses `createStoredSignal` through `createForestLayoutStorage`; persistence reads the current layout and submits current/next values, rather than using `createStoredConfig`. |
| `{ticketsPath}/{ticketFolder}/status.json` | Uses `createStoredSignal` through `createTicketStatusStorage`; persistence submits current/next ticket values through a Router action, rather than using `createStoredConfig`. |
| `config/running/{projectSlug}/{ticketFolder}.json` | Runtime agent marker; remains outside `StoredSignal` storage. |
| `{Electron userData}/window-state.json` | Remains outside `StoredSignal` storage; read and written directly through the filesystem in `electron/main.ts`. |
| `config-defaults/config.json` | Static initialization default; no independent `StoredSignal` store. |
| `config-defaults/launcher-config.json` | Static initialization default; no independent `StoredSignal` store. |
| `config-defaults/project-launcher-config.json` | Static fallback for missing project launcher config; no independent `StoredSignal` store. |
| `config-defaults/boards.json` | Static initialization default; no independent `StoredSignal` store. |
| `config-defaults/command-templates.json` | Imported built-in Command Template defaults; no independent `StoredSignal` store. |
