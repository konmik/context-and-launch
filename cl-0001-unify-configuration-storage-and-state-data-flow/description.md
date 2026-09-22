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
