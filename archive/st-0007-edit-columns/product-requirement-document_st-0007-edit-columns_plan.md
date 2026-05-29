# ST-0007 Edit Columns -- Implementation Plan

## Overview

This plan implements full Board Definition and Column CRUD in AI Stages: data model migration from `string[]` to `{ name, description? }[]` columns, server-side CRUD with rename migration, REST API routes, a "Columns" tab in Settings, board-assignment dropdown in General tab, column descriptions on the KanbanBoard, and a virtual "undefined" column for orphaned tickets.

## Pre-existing State

The branch `ai/st-0007-edit-columns` already has:
- Two ADRs: `docs/adr/0008-column-rename-migration-scopes.md` and `docs/adr/0009-virtual-undefined-column-for-orphaned-tickets.md`
- Updated `CONTEXT.md` glossary with Column description, Undefined Column, and relationship updates

All implementation code is new work. No code changes have been made yet.

## Codebase Architecture Reference

Key files and patterns the implementor must understand:

- Types: `src/types.ts` -- all shared interfaces (BoardDefinition, BoardConfig, BoardState, TicketInfo, LauncherConfig, etc.)
- Server singletons: `src/server/instances.ts` -- creates ConfigPaths, BoardConfigManager, LauncherConfigManager, etc.
- Board config: `src/server/board-config.ts` -- BoardConfigManager with loadAll/listBoards/getBoard/getConfig
- Launcher config: `src/server/launcher-config.ts` -- LauncherConfigManager with CRUD for templates/skills/profiles/shortcuts, columnDefaults, mergedConfig
- Config paths: `src/server/config-paths.ts` -- ConfigPaths for file path resolution
- Ticket store: `src/server/ticket-store.ts` -- TicketStore reads/writes status.json, toKebabCase for slugification
- Ticket order: `src/server/ticket-order.ts` -- TicketOrderStore.reconcile groups tickets into columns
- Server actions: `src/server/actions.ts` -- loadBoard query assembles BoardPageData
- API routes: `src/routes/api/` -- file-based routing with exported GET/POST/PUT/DELETE functions
- KanbanBoard: `src/components/KanbanBoard.tsx` -- renders columns from `props.board.columns` (currently string[])
- TicketCard: `src/components/TicketCard.tsx` -- individual ticket card with menu
- LauncherSettings: `src/components/LauncherSettings.tsx` -- FloatingPanel with tabs (general, templates, skills, profiles)
- UI primitives: `src/components/ui/dialog.tsx` (DialogRoot with Portal), `tabs.tsx`, `menu.tsx`, `floating-panel.tsx`
- E2E infra: `e2e/mock-server.ts` (HTTP mock serving built SolidJS client), `e2e/setup-test-data.ts` (BoardPageData factories)
- Project page: `src/routes/project/[slug].tsx` -- orchestrates board + dialogs + settings

Patterns to follow:
- API routes: export async functions matching HTTP method names, import from `~/server/instances.js`, use `errorMessage(e)` for error responses
- CRUD methods in managers: throw on validation errors, caller catches and returns error response
- Tests: vitest with temp directories for server tests, `@solidjs/testing-library` for component render tests, Playwright via `chromium.launch` for e2e
- No z-index: use Portal from solid-js/web
- No Co-Authored-By in commits
- Run `npm run test:all` to validate (tsc + unit + build + e2e)

---

## Step 1: Data Model Migration -- Types

Change `BoardDefinition.columns` and `BoardConfig.columns` from `string[]` to `ColumnDefinition[]`. Change `BoardState.columns` similarly. Add the `ColumnDefinition` interface.

### Files to modify

`src/types.ts`:
- Add interface `ColumnDefinition { name: string; description?: string }`
- Change `BoardDefinition.columns` from `string[]` to `ColumnDefinition[]`
- Change `BoardConfig.columns` from `string[]` to `ColumnDefinition[]`
- Change `BoardState.columns` from `string[]` to `ColumnDefinition[]`

### Acceptance criteria
- TypeScript compilation fails at all downstream consumers (expected -- fixed in subsequent steps)
- The `ColumnDefinition` type is the single source of truth for column shape

### Edge cases
- Existing `boards.json` files on disk have `string[]` columns -- migration handled in Step 2

---

## Step 2: BoardConfigManager -- Migration + CRUD

Expand `BoardConfigManager` with: (a) migration of legacy `string[]` columns on load, (b) a `slugifyColumnName` helper, (c) full board and column CRUD methods.

### Files to modify

`src/server/board-config.ts`:

1. Update `DEFAULT_BOARDS` to use `ColumnDefinition[]`:
```typescript
export const DEFAULT_BOARDS: BoardDefinition[] = [
  { id: 'kanban', name: 'Kanban', columns: [
    { name: 'todo' }, { name: 'prd' }, { name: 'in-progress' }, { name: 'review' }, { name: 'done' }
  ]},
  { id: 'simple', name: 'Simple', columns: [
    { name: 'todo' }, { name: 'in-progress' }, { name: 'done' }
  ]},
];
```

2. Add `slugifyColumnName(input: string): string` -- exported, pure function:
   - Lowercase, replace spaces with hyphens, strip characters not matching `[a-z0-9-]`, collapse multiple hyphens, trim leading/trailing hyphens
   - Reuse the same logic as `toKebabCase` from ticket-store.ts but adapted for column names (same pattern)

3. Add column name validation helper `validateColumnName(name: string, existingNames: string[], allowSameName?: string): string`:
   - Slugify the input
   - Reject empty result (throw Error)
   - Reject the reserved name "undefined" (throw Error)
   - Reject duplicates in existingNames (excluding allowSameName for rename scenarios) (throw Error)
   - Return the slugified name

4. Update `loadAll()`:
   - After parsing, migrate each board's columns: if any entry is a plain string, wrap it as `{ name: entry }`
   - This handles legacy `boards.json` files transparently

5. Add private `saveAll(boards: BoardDefinition[]): void`:
   - Writes the full array to `boardsFile()`

6. Add `slugifyBoardId(name: string): string`:
   - Same slugification logic as column names

7. Add board CRUD methods:
   - `createBoard(name: string): BoardDefinition` -- slugify name to id, reject if id already exists or empty, append to boards array, save, return
   - `deleteBoard(boardId: string): void` -- reject if only one board remains, find and remove, save
   - `renameBoard(boardId: string, newName: string): void` -- find board, update name (id stays the same), save

8. Add column CRUD methods:
   - `addColumn(boardId: string, name: string, description?: string): ColumnDefinition` -- find board, validate name, append column, save, return
   - `removeColumn(boardId: string, columnName: string): void` -- find board, find column, remove, save
   - `updateColumn(boardId: string, columnName: string, patch: { description?: string }): void` -- find board, find column, update description, save
   - `renameColumn(boardId: string, oldName: string, newName: string): { oldName: string; newName: string }` -- find board, validate new name, update column name, save, return both names
   - `reorderColumns(boardId: string, orderedNames: string[]): void` -- find board, validate all names match, reorder columns array to match, save

### Files to modify (test)

`src/server/board-config.test.ts`:

Add comprehensive tests:
- Migration: legacy string[] columns are converted to ColumnDefinition[] on load
- createBoard: happy path, duplicate id rejection, empty name rejection
- deleteBoard: happy path, rejection when last board
- renameBoard: happy path, nonexistent board throws
- addColumn: happy path with name + description, duplicate name rejection, empty name rejection, "undefined" name rejection, slugification (spaces to hyphens, special chars stripped), name collision after slugification
- removeColumn: happy path, nonexistent column throws
- updateColumn: description update
- renameColumn: happy path, duplicate name rejection
- reorderColumns: happy path, mismatched names rejection
- getConfig: returns ColumnDefinition[] columns

### Acceptance criteria
- All existing board-config tests still pass (updated to use ColumnDefinition[])
- New CRUD tests pass
- Legacy migration is transparent
- Validation rejects all specified invalid inputs

---

## Step 3: Column Rename Migration Logic

Add a server-side function that migrates ticket statuses and column defaults when a column is renamed.

### Files to create

`src/server/column-rename-migration.ts`:

```typescript
export type MigrationScope = 'all' | 'current' | 'none';

export interface MigrationResult {
  ticketsUpdated: number;
  projectsUpdated: number;
}

export function migrateColumnRename(
  boardId: string,
  oldColumnName: string,
  newColumnName: string,
  scope: MigrationScope,
  currentSlug: string,
  deps: {
    projectRegistry: ProjectRegistry;
    launcherConfigManager: LauncherConfigManager;
    worktreeManager: WorktreeManager;
  }
): MigrationResult
```

Logic:
1. If scope is `'none'`, return `{ ticketsUpdated: 0, projectsUpdated: 0 }`
2. Determine which project slugs to process:
   - `'current'`: only `currentSlug`
   - `'all'`: iterate all projects from `projectRegistry.listProjects()`, filter to those whose `launcherConfigManager.getMergedConfig(slug).boardId` matches `boardId` (or is null and boardId is the default)
3. For each project slug:
   - Get the worktree dir from `worktreeManager.getWorktreeDir(slug)`
   - Create a `TicketStore` for that worktree
   - List all tickets; for each ticket whose `status === oldColumnName`, call `store.updateTicket(folderName, null, null, newColumnName)`
   - Re-key `columnDefaults` in the project's launcher config: load project config, if `columnDefaults[oldColumnName]` exists, copy to `columnDefaults[newColumnName]` and delete old key, save
4. Return counts

### Files to create (test)

`src/server/column-rename-migration.test.ts`:

Tests:
- scope "none": no changes
- scope "current": only current project tickets updated, column defaults re-keyed
- scope "all": all matching projects updated
- Adversarial: no tickets match old status (ticketsUpdated = 0), project has no columnDefaults, project config missing, slugs that don't use this board are skipped

### Acceptance criteria
- Migration updates ticket `status` fields in status.json
- Migration re-keys `columnDefaults` in launcher-config.json
- Stage markdown files are NOT renamed
- Scope filtering works correctly

---

## Step 4: Board API Routes

Create REST endpoints for board and column CRUD.

### Files to create

`src/routes/api/boards.ts`:
- `GET`: return `boardConfigManager.listBoards()` as JSON
- `POST`: parse `{ name }` from body, call `boardConfigManager.createBoard(name)`, return 201 with created board

`src/routes/api/boards/[boardId].ts`:
- `PUT`: parse `{ name }` from body, call `boardConfigManager.renameBoard(boardId, name)`, return 204
- `DELETE`: call `boardConfigManager.deleteBoard(boardId)`, return 204

`src/routes/api/boards/[boardId]/columns.ts`:
- `POST`: parse `{ name, description? }` from body, call `boardConfigManager.addColumn(boardId, name, description)`, return 201 with created column

`src/routes/api/boards/[boardId]/columns/[columnName].ts`:
- `PUT`: parse `{ description? }` from body, call `boardConfigManager.updateColumn(boardId, columnName, { description })`, return 204
- `DELETE`: call `boardConfigManager.removeColumn(boardId, columnName)`, return 204

`src/routes/api/boards/[boardId]/columns/reorder.ts`:
- `PUT`: parse `{ columns: string[] }` from body, call `boardConfigManager.reorderColumns(boardId, columns)`, return 204

`src/routes/api/boards/[boardId]/columns/[columnName]/rename.ts`:
- `POST`: parse `{ newName, scope, currentSlug }` from body
- Call `boardConfigManager.renameColumn(boardId, columnName, newName)` to get the validated new name
- Call `migrateColumnRename(boardId, columnName, newName, scope, currentSlug, { projectRegistry, launcherConfigManager, worktreeManager })`
- Return 200 with `{ newName, ticketsUpdated, projectsUpdated }`

`src/routes/api/projects/[slug]/launcher-config/board-id.ts`:
- `PUT`: parse `{ boardId }` from body, load project config, set `boardId`, save, return 204

All routes follow the existing pattern: import from `~/server/instances.js`, use `errorMessage(e)`, catch and return 400/500.

### Acceptance criteria
- All endpoints respond correctly for valid requests
- Error responses use consistent format matching existing routes
- Invalid inputs (missing fields, nonexistent boards) return 400

### Validation checks
- Start dev server, use curl/fetch to exercise each endpoint
- Unit tests are not needed for thin route handlers (logic lives in managers) but e2e will cover them

---

## Step 5: Update Downstream Consumers of Column Types

Now that columns are `ColumnDefinition[]` instead of `string[]`, update all code that reads column names.

### Files to modify

`src/server/actions.ts` -- `loadBoard`:
- `boardConfigManager.getConfig(merged.boardId)` now returns `{ columns: ColumnDefinition[] }`
- `store.loadBoardState(config.columns.map(c => c.name))` -- TicketStore/TicketOrderStore still work with string column names
- `board: { columns: config.columns, tickets, ticketOrder }` -- BoardState.columns is now ColumnDefinition[]
- `createTicketAction`: `firstColumn` is now `config.columns[0]?.name` (was `config.columns[0]`)

`src/server/ticket-order.ts` -- `TicketOrderStore.reconcile`:
- The `columns` parameter is `string[]` (ticket statuses are still strings). No change needed here -- the caller maps `ColumnDefinition[].map(c => c.name)` before calling.

`src/components/KanbanBoard.tsx`:
- `props.board.columns` is now `ColumnDefinition[]`
- In the `<For each={props.board.columns}>`, each item is a `ColumnDefinition` instead of a string
- Extract `column.name` where column names are used: `ticketsForColumn(column.name)`, `idsForColumn(column.name)`, `columnRefs.set(column.name, el)`, `makeId(column.name, ...)`, column header display
- Display `column.description` below the column header (when set)

`src/components/KanbanBoard.render.test.tsx`:
- Update `makeBoard` helper: `columns` parameter becomes `ColumnDefinition[]` or update to accept string[] and map internally
- All tests continue to work with the adapted helper

`e2e/setup-test-data.ts`:
- `BoardState.columns` becomes `ColumnDefinition[]`
- `DEFAULT_COLUMNS` becomes `[{ name: 'todo' }, { name: 'in-progress' }, { name: 'done' }]`
- `createBoardWithTickets` and `buildTicketOrder` updated accordingly

`e2e/mock-server.ts`:
- No changes expected if mock data comes from `setup-test-data.ts`

### Acceptance criteria
- `tsc --noEmit` passes with zero errors
- All existing unit tests pass
- All existing e2e tests pass
- KanbanBoard renders column headers as before (using `column.name`)

---

## Step 6: KanbanBoard -- Column Descriptions

Display column descriptions below column headers on the board.

### Files to modify

`src/components/KanbanBoard.tsx`:
- In the column `<For>` loop, after the `<h3>` column header, add:
```tsx
<Show when={column.description}>
  <p class="mb-2 text-xs text-muted-foreground">{column.description}</p>
</Show>
```

### Files to modify (test)

`src/components/KanbanBoard.render.test.tsx`:
- Add test: column with description renders description text below header
- Add test: column without description does not render description element

### Acceptance criteria
- Column descriptions appear as muted text below column headers
- Columns without descriptions show no extra element
- Existing tests still pass

---

## Step 7: KanbanBoard -- Virtual "Undefined" Column

Render a red-styled "undefined" column at the far right when orphaned tickets exist.

### Files to modify

`src/components/KanbanBoard.tsx`:

1. Compute orphaned tickets: in a `createMemo`, compare all ticket statuses against `props.board.columns.map(c => c.name)`. Tickets whose status is not in any column name are orphaned.

2. After the `<For each={props.board.columns}>` block, add a `<Show when={orphanedTickets().length > 0}>` block rendering:
   - A column div with red border styling: `border-2 border-destructive` (or `border-red-500`)
   - Header "undefined" in red: `text-destructive`
   - Each orphaned ticket rendered with a `SortableTicketCard` (or a simplified card) showing:
     - The normal ticket card content
     - An additional line showing the ticket's orphaned status in red text
   - Support drag-out: orphaned tickets participate in the DnD system so they can be dragged to real columns

3. The `ticketOrder()` function needs to include orphaned tickets under a synthetic "undefined" key so the DnD system can identify them.

4. Update `commitDrop` to handle dragging from the "undefined" pseudo-column: when `fromColumn === "undefined"`, the ticket's status is updated to `toColumn` via the existing `onReorder` callback.

### Ticket card modification for orphaned status display

`src/components/TicketCard.tsx`:
- Add optional prop `orphanedStatus?: string`
- When set, render an additional line: `<p class="text-xs text-destructive">{props.orphanedStatus}</p>`

### Files to modify (test)

`src/components/KanbanBoard.render.test.tsx`:
- Add test: tickets with status not matching any column appear in undefined column
- Add test: undefined column has red styling
- Add test: undefined column shows orphaned status text
- Add test: undefined column does not render when no orphaned tickets exist
- Add test: orphaned ticket card shows orphaned status in red

### Acceptance criteria
- Orphaned tickets appear in a red "undefined" column at far right
- Each orphaned ticket shows its actual status in red
- Dragging out of undefined column works (calls onReorder)
- Column disappears when no orphaned tickets exist
- All existing drag-and-drop tests still pass

---

## Step 8: Settings UI -- Columns Tab

Add a "Columns" tab to LauncherSettings for managing boards and columns.

### Files to modify

`src/components/LauncherSettings.tsx`:

1. Add state signals:
   - `boards: BoardDefinition[]` -- loaded from GET /api/boards
   - `selectedBoardId: string` -- which board is being edited
   - `columnForm: { mode: 'add' | 'edit', name: string, description: string, oldName?: string } | null`
   - `boardForm: { mode: 'add', name: string } | null`
   - `renameForm: { oldName: string, newName: string, scope: MigrationScope } | null`
   - `deleteConfirm: { type: 'board' | 'column', id: string } | null`

2. Add a `loadBoards()` function: fetch GET /api/boards, setBoards

3. Update `loadConfig()` to also call `loadBoards()`

4. Add tab trigger in TabsList:
```tsx
<TabsTrigger value="columns">Columns</TabsTrigger>
```

5. Add `<TabsContent value="columns">` with:
   - Board selector dropdown (HTML select) at top showing all boards, bound to `selectedBoardId`
   - "Add Board" button next to dropdown (opens board-name modal)
   - "Delete Board" button (disabled when only one board, opens confirmation dialog)
   - Divider or section header "Columns"
   - "Add" column button in section header
   - List of columns for the selected board, each as an `ItemRow`-like component showing:
     - Column name
     - Column description (or placeholder)
     - Edit button (opens column edit modal)
     - Delete button (opens confirmation dialog)
   - Drag handles for reorder (use HTML5 drag or a simplified drag approach; the existing `@thisbeyond/solid-dnd` is available)

6. Column add/edit modal (reuse DialogRoot pattern):
   - Name input with slugified preview below (live-updating as user types)
   - Description textarea
   - Save button (disabled when name is empty or validation fails)
   - Validation: show error for duplicates, empty, "undefined"

7. Column rename modal (separate dialog triggered when editing changes the name):
   - Shows old name and new name
   - Three radio buttons: "All projects", "Current project", "None"
   - Default selection: "All projects"
   - Save calls POST /api/boards/[boardId]/columns/[oldName]/rename

8. Board add modal:
   - Name input
   - Save calls POST /api/boards

9. Delete confirmation dialogs:
   - Board: "Delete board [name]? This cannot be undone."
   - Column: "Delete column [name]? Tickets with this status will appear in the undefined column."

### API calls from Columns tab

- Load boards: `GET /api/boards`
- Create board: `POST /api/boards` with `{ name }`
- Delete board: `DELETE /api/boards/[boardId]`
- Add column: `POST /api/boards/[boardId]/columns` with `{ name, description? }`
- Edit column (description only): `PUT /api/boards/[boardId]/columns/[columnName]` with `{ description }`
- Delete column: `DELETE /api/boards/[boardId]/columns/[columnName]`
- Rename column: `POST /api/boards/[boardId]/columns/[columnName]/rename` with `{ newName, scope, currentSlug }`
- Reorder columns: `PUT /api/boards/[boardId]/columns/reorder` with `{ columns: string[] }`

### Acceptance criteria
- Columns tab appears in settings
- Board selector shows all boards
- Board CRUD works (create, delete with confirmation)
- Column list shows name and description for each column
- Column CRUD works (add, edit, delete with confirmation)
- Rename shows migration scope dialog when name changes
- Slugified preview appears when typing column name
- Validation rejects invalid names with visible error
- Drag-to-reorder persists new order

---

## Step 9: Settings UI -- General Tab Board Assignment

Add a board-assignment dropdown to the General tab.

### Files to modify

`src/components/LauncherSettings.tsx`:
- In the General tab content, add a new section before or after the worktree root path section:
```tsx
<section>
  <h3 class="mb-2 text-sm font-semibold">Board <ScopeBadge scope="project" /></h3>
  <select value={selectedProjectBoardId()} onChange={handleBoardIdChange} class="input input-sm">
    <For each={boards()}>
      {(b) => <option value={b.id}>{b.name}</option>}
    </For>
  </select>
</section>
```
- `selectedProjectBoardId` derives from `config()?.boardId ?? DEFAULT_BOARD_ID`
- `handleBoardIdChange` calls PUT /api/projects/[slug]/launcher-config/board-id with `{ boardId }`, then reloads config

### Acceptance criteria
- Board dropdown appears in General tab
- Changing the board saves the selection
- Board change persists on page reload

---

## Step 10: Mock Server Updates for E2E

Update the mock server to handle the new API endpoints.

### Files to modify

`e2e/mock-server.ts`:

Add route handlers for:
- `GET /api/boards` -- return mock boards from state
- `POST /api/boards` -- create a board in mock state
- `DELETE /api/boards/[boardId]` -- remove from mock state
- `PUT /api/boards/[boardId]` -- rename in mock state
- `POST /api/boards/[boardId]/columns` -- add column in mock state
- `PUT /api/boards/[boardId]/columns/[columnName]` -- update column in mock state
- `DELETE /api/boards/[boardId]/columns/[columnName]` -- remove column in mock state
- `PUT /api/boards/[boardId]/columns/reorder` -- reorder in mock state
- `POST /api/boards/[boardId]/columns/[columnName]/rename` -- rename column in mock state
- `PUT /api/projects/[slug]/launcher-config/board-id` -- set boardId in mock state

Add to `MockServerState`:
- `boards?: BoardDefinition[]` -- defaults to DEFAULT_BOARDS clone

`e2e/setup-test-data.ts`:
- Already updated in Step 5 for ColumnDefinition[] columns
- Add `DEFAULT_BOARDS` export for e2e tests

### Acceptance criteria
- Mock server handles all new endpoints
- Existing e2e tests still pass

---

## Step 11: E2E Tests -- Columns Tab

Write Playwright e2e tests for the Columns tab in Settings.

### Files to create

`e2e/columns-tab.test.ts`:

Tests (each uses mock server with default boards):
1. Open Settings, navigate to Columns tab, verify board selector shows available boards
2. Create a new board via Add Board button and modal
3. Delete a board with confirmation dialog (setup: create a second board first)
4. Add a column with name and description via modal
5. Edit a column description
6. Delete a column with confirmation
7. Rename a column and verify the three-scope migration dialog appears
8. Verify slugified preview appears when typing a column name
9. Verify validation rejects duplicate, empty, and reserved column names (visual error message appears)
10. Switch board assignment in the General tab

### Testing approach
- Follow `e2e/settings.test.ts` pattern: `chromium.launch`, `startMockServer`, navigate to `/project/e2e-test`
- Click Settings gear button, wait for panel
- Click "Columns" tab trigger
- Interact with UI elements using data-testid selectors (add appropriate data-testid attributes in Step 8)
- Mock server state updates reflect in subsequent API calls

### Acceptance criteria
- All tests pass with `vitest run e2e/columns-tab.test.ts`
- Tests are deterministic (no flaky timing issues)

---

## Step 12: E2E Tests -- Column Descriptions and Undefined Column

Write Playwright e2e tests for KanbanBoard column descriptions and the undefined column.

### Files to create

`e2e/undefined-column.test.ts`:

Tests:
1. Board with column descriptions: verify descriptions render below column headers
2. Ticket with status not matching any column: verify "undefined" column appears at far right
3. Verify undefined column shows orphaned status in red on ticket cards
4. Verify the undefined column has red border styling
5. Verify the undefined column disappears when there are no orphaned tickets

### Testing approach
- Use mock server with custom board data:
  - Board with columns `[{ name: 'todo', description: 'Work to do' }, { name: 'done' }]`
  - Tickets including one with `status: 'deleted-column'` (not matching any board column)
- For disappearing test: start with orphaned ticket, use mock server callback on reorder to update ticket status, verify column disappears

### Acceptance criteria
- All tests pass
- Tests verify visual elements (red styling, description text)

---

## Step 13: Drag-to-Reorder Columns in Settings

Implement drag-to-reorder for columns in the Columns tab.

### Files to modify

`src/components/LauncherSettings.tsx`:

Use `@thisbeyond/solid-dnd` (already in dependencies) for the column list:
- Wrap the column list in `DragDropProvider` + `DragDropSensors` + `SortableProvider`
- Each column row becomes a sortable item with a drag handle
- On drag end, compute new order and call `PUT /api/boards/[boardId]/columns/reorder`
- Update local state optimistically

### Acceptance criteria
- Columns can be reordered by dragging
- New order persists after page reload
- Drag handles are visible and clickable

### Note on complexity
This step is separated because drag-and-drop adds significant interaction complexity. If time is tight, a simpler up/down arrow approach can substitute, but the PRD specifies drag handles.

---

## Step 14: Final Integration and Validation

### Validation checklist

1. Run `npm run test:all` -- all tests pass (tsc + unit + build + e2e)
2. Manual testing:
   - Create a new board, add columns, verify on KanbanBoard
   - Delete a column, verify orphaned tickets in undefined column
   - Rename a column with "All projects" scope, verify ticket statuses updated
   - Add descriptions to columns, verify they appear on board
   - Switch board in General tab, verify board changes
   - Create a ticket, verify it lands in the first column
3. Edge cases to verify manually:
   - Column name with special characters slugifies correctly
   - "undefined" as a column name is rejected
   - Deleting the last board is prevented
   - Board assignment dropdown shows all boards
   - Settings panel opens/closes without state leaks

### Files to potentially touch for final cleanup
- `src/server/board-config.ts` -- any validation edge cases
- `src/components/LauncherSettings.tsx` -- UI polish
- `e2e/` tests -- any flaky test fixes

---

## Data-Testid Attribute Plan

Add these data-testid attributes during implementation for e2e test selectors:

Settings panel (Step 8):
- `data-testid="tab-columns"` on the Columns tab trigger
- `data-testid="board-selector"` on the board dropdown
- `data-testid="add-board-btn"` on the Add Board button
- `data-testid="delete-board-btn"` on the Delete Board button
- `data-testid="add-column-btn"` on the Add Column button
- `data-testid="column-row"` on each column row (with `data-column-name` attribute)
- `data-testid="column-name-input"` on the column name input in modal
- `data-testid="column-desc-input"` on the column description input in modal
- `data-testid="column-slug-preview"` on the slugified preview
- `data-testid="rename-scope-all"` / `rename-scope-current` / `rename-scope-none` on radio buttons
- `data-testid="board-id-select"` on the board assignment dropdown in General tab

KanbanBoard (Step 7):
- `data-testid="undefined-column"` on the undefined column container
- `data-testid="orphaned-status"` on the orphaned status text in ticket cards
- `data-testid="column-description"` on column description elements

---

## Dependency Graph

```
Step 1 (types) 
  |
  v
Step 2 (BoardConfigManager CRUD) -----> Step 3 (migration logic)
  |                                        |
  v                                        v
Step 4 (API routes) <----- depends on -----+
  |
  v
Step 5 (downstream consumers) -----> Step 6 (descriptions) -----> Step 7 (undefined column)
  |
  v
Step 8 (Columns tab) -----> Step 9 (General tab board assignment)
  |
  v
Step 10 (mock server) -----> Step 11 (e2e columns tab) -----> Step 12 (e2e board features)
  |
  v
Step 13 (drag reorder in settings)
  |
  v
Step 14 (final validation)
```

Steps 1-5 must be sequential. Steps 6 and 7 depend on 5 but are independent of 8-9. Steps 8-9 depend on 4. Steps 10-12 depend on all prior steps. Step 13 depends on 8. Step 14 is last.

---

## Risk Areas

1. TicketOrderStore.reconcile: currently receives `string[]` columns. After Step 5, the caller maps `ColumnDefinition[].map(c => c.name)` before passing. The reconcile logic itself does not change, but the orphaned tickets (status not in any column) are currently silently placed into `columns[0]`. For the undefined column feature, this behavior must change: orphaned tickets should NOT be placed into `columns[0]` -- they should be collected separately. This requires modifying `TicketOrderStore.reconcile` to return orphaned tickets separately, or modifying the KanbanBoard to compute orphans client-side from `props.board.tickets` vs `props.board.columns`. The simpler approach is client-side computation in KanbanBoard (Step 7), leaving TicketOrderStore unchanged. However, this means `reconcile` still places orphans in `columns[0]` for the ticketOrder -- the KanbanBoard must override this by filtering orphans out of the first column's ticket list and into the undefined column.

   Resolution: Modify `TicketOrderStore.reconcile` to NOT place orphans into `columns[0]`. Instead, orphan tickets get their own `"undefined"` key in the returned `TicketOrder`. Update `loadBoardState` in `TicketStore` accordingly. The KanbanBoard then reads `ticketOrder["undefined"]` for the virtual column. This is the cleaner approach.

2. Column rename migration: when `scope === 'all'`, the migration iterates all projects. If a project's worktree doesn't exist (not yet initialized), `worktreeManager.getWorktreeDir(slug)` may throw. The migration should skip projects whose worktree cannot be resolved (catch and continue).

3. DnD in settings: reusing `@thisbeyond/solid-dnd` inside a floating panel may have interaction quirks. Test thoroughly.

4. Existing e2e tests: the `setup-test-data.ts` change from `string[]` to `ColumnDefinition[]` affects all existing e2e tests. Run them early after Step 5 to catch regressions.
