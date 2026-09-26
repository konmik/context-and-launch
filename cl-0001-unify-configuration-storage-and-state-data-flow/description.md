Unify storage and reactive data flow for mutable application configuration and user-managed state. Use shared `StoredSignal`-compatible stores and appropriately scoped Solid contexts, while preserving each domain's persistence and update semantics.

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

### Appearance preferences

- Browser/Electron `localStorage`: `palette`, `theme`, `palette:{projectSlug}`, and `theme:{projectSlug}`. Project values fall back to global preferences when absent.

## Current refactoring state

Fact-checked against application commit `e17d100`. Paths were checked against `ConfigPaths`, `WorktreeManager`, and the ticket repositories. The table records implemented stores/providers, not proof that every writer or consumer has migrated.

Source paths below are relative to `src/`.

| Persisted data | Uses StoredSignal AND useContext | Verified implementation | Provider scope/location |
| --- | --- | --- | --- |
| `config/config.json` | Yes | `createStoredConfig` in `components/config/app-config-storage.ts` | App, `app.tsx` |
| `config/launcher-config.json` | Yes | `createStoredConfig` in `components/launcher/shared-launcher-config-storage.ts` | App, `app.tsx` |
| `config/boards.json` | Yes | `createStoredConfig` in `components/board/board-config-storage.ts` | App, `app.tsx` |
| `config/command-templates.json` | Yes | `createStoredConfig` in `components/launcher/command-template-storage.ts` | App, `app.tsx` |
| `projects/{projectSlug}/config/launcher-config.json` | Yes | `createStoredConfig` in `components/launcher/project-launcher-config-storage.ts` | Project, `pages/project.tsx` |
| `projects/{projectSlug}/config/diff-review.json` | Yes | `createStoredConfig` in `components/diff-review/DiffReview.tsx`; context in `diff-review-storage.ts` | Mounted Diff Review, `DiffReview.tsx` |
| `{ticketsPath}/ticket-order.json` | Yes | `createStoredSignal` in `components/board/ticket-order-storage.ts` | Project, `pages/project.tsx` |
| `{ticketsPath}/forest-layout.json` | Yes | `createStoredSignal` in `components/forest/forest-layout-storage.ts` | Mounted Forest View, `components/forest/ForestView.tsx` |
| `{ticketsPath}/{ticketFolder}/status.json` | Yes | `createStoredSignal` in `components/ticket/ticket-status-storage.ts` | Ticket detail, `components/ticket/TicketDetailDialog.tsx`; domain actions also write this file |
| Appearance preferences | Yes | `createStoredSignal` in `components/shared/appearance.tsx` | `AppearanceRoot` in `app.tsx`, selects global/project storage by route |

"Yes" means the data has a `StoredSignal`-compatible store and a consumer reads that store using `useContext`; it does not mean every operation goes through that store.

`createStoredConfig` implements the `StoredSignal` interface through the shared `createStoredState` queue; it does not call `createStoredSignal` directly.

The ticket-status store covers detail edits (number, title, status, references, and `useWorktree`). Dependency/group operations still use domain actions in `components/forest/forest-api.ts`; the original unqualified "Yes" did not establish full-file migration.
