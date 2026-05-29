## Problem Statement

There is no UI for managing Board Definitions or their Columns. Users must manually edit `boards.json` to add, remove, rename, or reorder columns. There is also no way to assign a Board Definition to a project through the UI, no way to add descriptions to columns, and no visibility into what happens to tickets when their column no longer exists.

## Solution

Add a "Columns" tab to the Settings panel for managing Board Definitions and their Columns. Add a board assignment dropdown to the General tab. Render column descriptions on the board. Show orphaned tickets (whose status does not match any column) in a virtual "undefined" column with red styling.

## Implementation Decisions

### Data model change

Change `BoardDefinition.columns` from `string[]` to `{ name: string, description?: string }[]`. Migrate existing boards on load: when `loadAll()` encounters a string entry, wrap it as `{ name: entry }`. Update `BoardConfig.columns` similarly. All downstream consumers that read column names must adapt to the new shape.

### Board CRUD in BoardConfigManager

Add methods to BoardConfigManager for full board lifecycle management:
- Create a new Board Definition (id auto-slugified from name)
- Delete a Board Definition (reject if it is the last remaining board)
- Rename a board
- Add a column to a board (with name and optional description)
- Remove a column from a board
- Rename a column (update name, preserve description)
- Update a column description
- Reorder columns within a board

Column name validation rules:
- Auto-slugify on save: lowercase, spaces to hyphens, strip filesystem-unsafe characters
- Reject duplicates within the same board
- Reject empty names
- Reject the reserved name "undefined"

### Rename migration logic

When a column is renamed, the server must be able to migrate ticket statuses and column defaults across projects. A new migration function accepts a scope parameter with three values:
- "all" -- iterate all projects using this board, update every ticket whose `status` matches the old column name, and re-key `columnDefaults` entries in each project's Launcher Config
- "current" -- same as above but only for the specified project slug
- "none" -- only rename in the Board Definition, leave tickets and defaults untouched

Ticket `status` fields in `status.json` are updated. Stage Markdown files are NOT renamed.

Column defaults (`LauncherColumnDefaults`) keyed by the old column name are re-keyed to the new column name in the affected project Launcher Configs.

### Board API routes

New REST endpoints under `/api/boards`:
- `GET /api/boards` -- list all Board Definitions
- `POST /api/boards` -- create a new Board Definition
- `PUT /api/boards/[boardId]` -- update a Board Definition (name)
- `DELETE /api/boards/[boardId]` -- delete a Board Definition
- `POST /api/boards/[boardId]/columns` -- add a column
- `PUT /api/boards/[boardId]/columns/[columnName]` -- update a column (rename, description)
- `DELETE /api/boards/[boardId]/columns/[columnName]` -- delete a column
- `PUT /api/boards/[boardId]/columns/reorder` -- reorder columns
- `POST /api/boards/[boardId]/columns/[columnName]/rename` -- rename with migration scope parameter

A new endpoint in the existing project launcher-config area:
- `PUT /api/projects/[slug]/launcher-config/board-id` -- assign a board to the current project

### Settings UI: Columns tab

New tab in LauncherSettings following the existing pattern (ItemRow + modal dialog):

- Board selector dropdown at the top of the tab to pick which board to edit
- "Add Board" button next to the dropdown (opens modal with board name field)
- "Delete Board" button for the selected board (confirmation dialog, disabled when only one board remains)
- List of columns for the selected board, displayed as draggable rows (drag-to-reorder via drag handles)
- Each column row shows the column name and description, with Edit and Delete buttons
- "Add" column button in the section header (opens modal with name + description fields)
- Column add/edit modal shows a slugified preview of the column name
- Column delete triggers a simple confirmation dialog
- Column rename triggers a dialog with three radio options: "All projects", "Current project", "None" -- asking whether to migrate ticket statuses and column defaults. Default selection: "All projects"

### Settings UI: General tab

Add a Board Definition dropdown to the General tab, letting the user assign which board the current project uses. Saves to `boardId` in the project's Launcher Config.

### KanbanBoard: column descriptions

Display the column's `description` (if set) below the column name header in the board view. Plain text, single line, styled as muted/secondary text.

This requires `BoardState` to carry column metadata instead of just `string[]`. Change `BoardState.columns` from `string[]` to `{ name: string, description?: string }[]` and update all consumers.

### KanbanBoard: virtual "undefined" column

When any ticket's `status` does not match a column in the active board, render a virtual "undefined" column at the far right of the board:
- Red frame (border) and red column title
- Only rendered when orphaned tickets exist; disappears when empty
- Users can drag tickets out of it into any real column (drag-out supported, drag-in not meaningful since tickets should be reassigned)
- Each ticket card in this column shows the ticket's actual orphaned `status` value as an additional line in red text

This covers two scenarios: a column was deleted from the board, or the project's assigned board was deleted entirely.

### Testing strategy

All modules use adversarial testing -- tests that specifically target edge cases, invalid inputs, race conditions, and boundary conditions rather than just happy paths. Each feature also gets e2e tests.

BoardConfigManager unit tests:
- CRUD happy paths for boards and columns
- Adversarial: duplicate column names, empty names, "undefined" as name, filesystem-unsafe characters in names, slugification edge cases (all-special-chars input, unicode), deleting the last board, adding a column that already exists after slugification, reordering with out-of-bounds indices, malformed boards.json recovery, concurrent board edits

Rename migration unit tests:
- Happy path migration across multiple projects
- Adversarial: renaming to a name that collides after slugification, migrating when no tickets match the old status, migrating when launcher config has no columnDefaults entry, project with missing/malformed config files, "none" scope leaving tickets unchanged

Board API route tests:
- CRUD operations return correct responses
- Adversarial: invalid board IDs, missing required fields, deleting non-existent boards, creating boards with duplicate IDs, rename migration with invalid scope values

Settings UI e2e tests (Playwright):
- Open Settings, navigate to Columns tab, verify board selector shows available boards
- Create a new board via the Add Board button and modal
- Delete a board with confirmation dialog
- Add a column with name and description via the modal
- Edit a column name and description
- Delete a column with confirmation
- Rename a column and verify the three-scope migration dialog appears
- Drag-to-reorder columns and verify the new order persists
- Verify slugified preview appears when typing a column name
- Verify validation rejects duplicate, empty, and reserved column names
- Switch board assignment in the General tab

KanbanBoard e2e tests (Playwright):
- Verify column descriptions render below column headers
- Delete a column, verify orphaned tickets appear in the red "undefined" column
- Verify the undefined column shows orphaned status in red on ticket cards
- Drag a ticket from the undefined column into a real column
- Verify the undefined column disappears when all orphaned tickets are reassigned
- Delete a board assigned to the current project, verify all tickets appear in the undefined column

## Out of Scope

- Per-project board definition overrides (forking a global board for local customization)
- Renaming Stage Markdown files when a column is renamed
- Column-level permissions or visibility rules
- Board templates or import/export
- Undo/redo for board or column operations
- Multi-select or bulk operations on columns

## Further Notes

The migration dialog on column rename is the most complex interaction. It must discover all projects using the affected board, scan their tickets, and batch-update status fields and column defaults. This should be a server-side operation exposed as a single API call to keep the client simple.

The virtual "undefined" column is intentionally not a real column in the Board Definition. It is computed at render time by comparing ticket statuses against the active board's column names. No data is written for it -- it is purely a UI construct.
