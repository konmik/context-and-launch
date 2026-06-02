# Three-Layer Architecture Refactoring Plan

## Background

The CLAUDE.md specifies that complex components must be split into three layers:

1. Pure functions (stateless data transforms, no signals, no framework imports, unit-testable)
2. Controller factory (owns signals internally, returns reactive accessors and commands, wires signals to pure functions)
3. Component (thin JSX wiring that connects controller to the framework)

Additional rules:
- Separate data types (fields only) from command types (functions only)
- Separate data types by update trigger
- Treat state as immutable (signal setters replace, never mutate)
- No effects to clear optimistic overrides; use basedOn pattern
- Component accepts controller return values as optional props for testability

## Already Refactored (do not touch)

These components already follow the three-layer pattern:

- KanbanBoard: `board-logic.ts` (pure) + `board-state.ts` (controller) + `KanbanBoard.tsx` (component)
- AgentLauncher: `agent-launcher-pure.ts` (pure) + `agent-launcher-controller.ts` (controller) + `AgentLauncher.tsx` (component)
- LauncherSettings: `launcher-settings-pure.ts` (pure) + `launcher-settings-state.ts` (controller) + `LauncherSettings.tsx` (component)

## Components That Do Not Need Refactoring

These are either UI primitives, thin wrappers, or presentational components with no internal state logic worth extracting:

- `src/components/ui/*` (dialog.tsx, menu.tsx, floating-panel.tsx, tabs.tsx, index.tsx) -- framework primitives, not application components
- `src/components/board/dnd-shared.tsx` -- presentational helpers (DragPreview, DragOverlayCard, DragGrip, NameDragOverlay)
- `src/components/board/kanban-columns.tsx` -- presentational, receives all data via props
- `src/components/board/kanban-id.ts` -- pure utility, already layer 1
- `src/components/board/drop-index.ts` -- pure utility, already layer 1
- `src/components/board/list-reorder.ts` -- reusable controller utility (shared by multiple components)
- `src/components/shared/ErrorDialog.tsx` -- stateless presentational dialog
- `src/components/shared/MarkdownEditor.tsx` -- CodeMirror wrapper, its complexity is framework integration not business logic
- `src/components/ticket/TicketCard.tsx` -- presentational, no signals
- `src/components/ticket/ticket-detail-parts.tsx` -- contains pure functions (isImage, isText, activeFileLabel, isActiveFileMatch) and stateless presentational sub-components (FileToolbar, EditorPane, ShortcutsTab, etc.)
- `src/components/ticket/ticket-detail-editor-tab.tsx` -- thin wiring, no state
- `src/components/ticket/ticket-detail-launcher-tab.tsx` -- thin wrapper around AgentLauncher
- `src/components/ticket/ticket-detail-shortcuts-tab.tsx` -- thin wrapper
- `src/components/launcher/launcher-settings-dialogs.tsx` -- presentational dialogs, no internal state
- `src/components/launcher/launcher-settings-rows.tsx` -- presentational row components
- `src/components/launcher/launcher-settings-*-tab.tsx` (general, prompts, skills, launch, columns) -- presentational tab content
- `src/routes/index.tsx` -- trivial redirect, no business logic
- `src/routes/add-project.tsx` -- thin page wrapper

## Components That Need Refactoring

### Step 1: TicketDetailDialog

This is the highest-priority and most complex remaining component. It has a controller (`ticket-detail-state.ts`) but no pure functions layer, and the controller mixes business logic with signal wiring.

Current files:
- `src/components/ticket/ticket-detail-state.ts` (controller, ~500 lines, contains extractable logic)
- `src/components/ticket/TicketDetailDialog.tsx` (component)
- `src/components/ticket/ticket-detail-parts.tsx` (already has some pure functions: isImage, isText, activeFileLabel, isActiveFileMatch)

Files to create/modify:
- CREATE `src/components/ticket/ticket-detail-pure.ts`
- MODIFY `src/components/ticket/ticket-detail-state.ts`
- MODIFY `src/components/ticket/TicketDetailDialog.tsx`
- MODIFY `src/components/ticket/ticket-detail-parts.tsx`
- CREATE `src/components/ticket/ticket-detail-pure.test.ts`

Pure functions to extract into `ticket-detail-pure.ts`:

1. Move `isImage`, `isText`, `activeFileLabel`, `isActiveFileMatch` from `ticket-detail-parts.tsx` to `ticket-detail-pure.ts`. Update imports in `ticket-detail-parts.tsx`, `ticket-detail-editor-tab.tsx`, and `ticket-detail-state.ts` to point to the new file. These are already pure -- they just need to live in a file that has no JSX/framework imports.

2. Extract `buildContextOptions(defaultNames: string[], existingNames: string[], extraFiles: string[]): ActiveFile[]` -- from the `contextOptions` function body in ticket-detail-state.ts.

3. Extract `buildFileEntryOptions(fileNames: string[]): ActiveFile[]` -- from `fileEntryOptions`.

4. Extract `buildReferenceOptions(references: { path: string; exists: boolean }[]): ActiveFile[]` -- from `referenceOptions`.

5. Extract `buildAllFileOptions(contextOpts: ActiveFile[], fileOpts: ActiveFile[], refOpts: ActiveFile[]): ActiveFile[]` -- concatenation helper.

6. Extract `isReadOnly(activeFile: ActiveFile): boolean` -- from `isCurrentReadOnly`.

7. Extract `checkReferenceStale(references: { path: string; exists: boolean }[], refPath: string): boolean` -- from `isReferenceStale`.

8. Extract `hasUnsavedEditorChanges(activeTab: string, fileViewMode: string, isReadOnly: boolean, content: string, savedContent: string): boolean` -- from `hasUnsavedChanges`.

9. Extract `slugifyFileName(raw: string): string` -- the file name slugification logic from `submitNewFile`.

10. Extract `wouldOverwrite(fileName: string, existingFileNames: string[], existingContextNames: string[]): boolean` -- from `wouldOverwrite`.

11. Extract `ticketApiUrl(projectSlug: string, folderName: string, suffix: string): string` -- from `ticketUrl`.

12. Extract `resolveFileViewMode(fileName: string): "editor" | "image" | "unsupported"` -- the logic that decides the view mode for a given file.

13. Extract `showSaveButton(activeTab: string, activeFileType: string): boolean` -- from `showSaveButton`.

14. Move the `ActiveFile` type definition from `ticket-detail-parts.tsx` to `ticket-detail-pure.ts` since it is a data type used across multiple files.

Controller changes to `ticket-detail-state.ts`:
- Replace inline logic with calls to the extracted pure functions
- Remove the `contextOptions`, `fileEntryOptions`, `referenceOptions`, `allFileOptions` closures and replace with memos that call the pure functions
- Replace `isCurrentReadOnly` with a memo calling `isReadOnly`
- Replace `hasUnsavedChanges` with a memo calling `hasUnsavedEditorChanges`
- Replace inline `ticketUrl` with calls to `ticketApiUrl`
- Replace inline `wouldOverwrite` with calls to the extracted pure function
- Replace inline slug logic in `submitNewFile` with `slugifyFileName`

Component changes to `TicketDetailDialog.tsx`:
- Add optional controller props (the `TicketDetailContent` component already creates the controller internally, but it does not accept it as optional prop). Add `ctrl?: ReturnType<typeof createTicketDetailState>` to `TicketDetailContent` props, with `const s = props.ctrl ?? createTicketDetailState(props)`.

Acceptance criteria:
- All pure functions have unit tests in `ticket-detail-pure.test.ts`
- `ticket-detail-pure.ts` has zero framework imports (no solid-js, no @solidjs/router)
- `ticket-detail-state.ts` has no business logic -- only signal wiring and pure function calls
- `TicketDetailDialog.tsx` accepts optional controller prop
- All existing tests pass: `npm run test:all`
- The `ActiveFile` type is importable from `ticket-detail-pure.ts` (re-export from `ticket-detail-parts.tsx` for backward compat)

Edge cases:
- `isActiveFileMatch` handles all three ActiveFile discriminants
- `slugifyFileName` must handle empty input, whitespace-only input, and input that slugifies to empty string
- `wouldOverwrite` must check both file names and context names (with .md suffix)

Dependencies: None. This step is independent.


### Step 2: ProjectPage ([projectSlug].tsx)

This is the main page component with significant state management. It orchestrates ticket CRUD, sync, conflict resolution, and dialog visibility.

Current file:
- `src/routes/project/[projectSlug].tsx` (~400 lines, mixes page state, API calls, and rendering)

Files to create/modify:
- CREATE `src/components/project/project-page-pure.ts`
- CREATE `src/components/project/project-page-controller.ts`
- CREATE `src/components/project/project-page-pure.test.ts`
- CREATE `src/components/project/project-page-controller.test.ts`
- MODIFY `src/routes/project/[projectSlug].tsx`

Pure functions to extract into `project-page-pure.ts`:

1. `ticketCrudUrl(projectSlug: string, folderName?: string): string` -- builds `/api/projects/{slug}/board/tickets` or `/api/projects/{slug}/board/tickets/{folderName}`.

2. `ticketArchiveUrl(projectSlug: string, folderName: string): string` -- builds the archive URL.

3. `syncUrl(projectSlug: string): string` -- builds the sync URL.

4. `resolveConflictsUrl(projectSlug: string): string` -- builds the resolve-conflicts URL.

5. `reorderUrl(projectSlug: string): string` -- builds the reorder URL.

6. `worktreeCleanupUrl(projectSlug: string): string` -- builds the worktree-cleanup URL.

7. `parseSyncResult(result: { status: string; message?: string }): { type: "success" } | { type: "conflict" } | { type: "error"; message: string }` -- classifies the sync API response.

8. `shouldShowCleanupDialog(ticket: TicketInfo): boolean` -- checks `ticket.useWorktree`.

Controller factory `createProjectPageController`:

Data types (fields only):
- `DialogState`: `{ createTicketOpen, editTicketOpen, deleteTicketOpen, archiveTicketOpen, cleanupDialogOpen, cleanupAction, settingsOpen, addProjectDialogOpen, conflictDialogOpen }`
- `SyncState`: `{ syncing, syncSuccess, syncError }`
- `SelectionState`: `{ selectedTicket, detailTicket }`

Command type (functions only):
- `ProjectPageCommands`: `{ openCreate, openEdit, openDelete, openArchive, openDetail, closeDetail, handleSync, handleConflictResolve, handleConflictAbort, handleReorder, handleCreateTicket, handleEditTicket, handleArchiveTicket, handleDeleteTicket, handleCleanupSubmit, openSettings, closeSettings, openAddProject, closeAddProject }`

The controller will own all the signals currently created inline in `ProjectPage()` and expose them as accessors grouped by update trigger.

Component changes to `[projectSlug].tsx`:
- Slim down to pure JSX wiring
- Accept optional controller prop
- Route load function stays in the route file

Acceptance criteria:
- `project-page-pure.ts` has zero framework imports
- Pure functions tested in `project-page-pure.test.ts`
- Controller tested in `project-page-controller.test.ts` (using `createRoot` like board-state.test.ts)
- Component accepts optional controller prop
- All existing e2e tests pass unchanged

Edge cases:
- `parseSyncResult` handles all three status values plus unexpected ones
- `handleViewDetail` must revalidate before opening (this stays in the controller since it involves async + revalidate)
- `handleDelete`/`handleArchive` must branch between cleanup and direct dialog based on `ticket.useWorktree`

Dependencies: None. Independent of Step 1.


### Step 3: AddProjectForm

This component has meaningful state (debounced path preview, form fields, browse handlers) that should be separated.

Current file:
- `src/components/project/AddProjectForm.tsx` (~165 lines)

Files to create/modify:
- CREATE `src/components/project/add-project-pure.ts`
- CREATE `src/components/project/add-project-controller.ts`
- CREATE `src/components/project/add-project-pure.test.ts`
- MODIFY `src/components/project/AddProjectForm.tsx`

Pure functions to extract into `add-project-pure.ts`:

1. `previewUrl(path: string): string` -- builds `/api/projects?previewPath=...`.

2. `pickDirectoryUrl(currentPath: string): string` -- builds `/api/pick-directory?path=...`.

3. `applyPreview(preview: ProjectPathsPreview | null, ticketsTouched: boolean, worktreeTouched: boolean): { ticketsRootPath?: string; worktreeRootPath?: string }` -- decides which preview values to use based on touch state.

4. `isSubmitDisabled(submitting: boolean, path: string): boolean`.

Controller factory `createAddProjectController`:

Takes deps:
- `action: (path, branch, worktreeRoot, ticketsPath) => Promise<result>`
- `onSuccess?: (projectSlug: string) => void`
- `errorMessage?: string`

Returns accessors: `pathValue, branchValue, ticketsRootPath, worktreeRootPath, submitting, localError, preview`
Returns commands: `setPathValue, setBranchValue, setTicketsRootPath, setWorktreeRootPath, handleBrowsePath, handleBrowseTicketsRoot, handleBrowseWorktreeRoot, handleSubmit`

Component changes:
- Accept optional controller prop
- Thin JSX

Acceptance criteria:
- `add-project-pure.ts` has zero framework imports
- Pure functions tested
- Component accepts optional controller prop
- e2e `add-project.test.ts` passes unchanged

Edge cases:
- Debounce timer cleanup on rapid path changes
- Preview fetch cancellation on component cleanup
- Empty/whitespace path disables submit

Dependencies: None. Independent of Steps 1-2.


### Step 4: ConflictDialog

Moderate complexity with state for profile loading, submission, and error handling.

Current file:
- `src/components/shared/ConflictDialog.tsx` (~98 lines)

Files to create/modify:
- CREATE `src/components/shared/conflict-dialog-pure.ts`
- CREATE `src/components/shared/conflict-dialog-controller.ts`
- CREATE `src/components/shared/conflict-dialog-pure.test.ts`
- MODIFY `src/components/shared/ConflictDialog.tsx`

Pure functions to extract into `conflict-dialog-pure.ts`:

1. `launcherConfigUrl(projectSlug: string): string` -- builds `/api/projects/{slug}/launcher-config`.

2. `extractProfiles(data: unknown): { name: string }[]` -- safely extracts the profiles array from the config response, replacing the inline `.then(data => ...)`.

3. `openConfigDirUrl(): string` -- returns `"/api/open-config-dir"`.

4. `openConfigDirBody(projectSlug: string): Record<string, string>` -- returns `{ scope: "tickets", projectSlug }`.

Controller factory `createConflictDialogController`:

Takes deps:
- `projectSlug: string`
- `open: boolean`
- `onResolve: (profileName: string) => Promise<void>`
- `onAbort: () => Promise<void>`
- `onOpenChange: (open: boolean) => void`

Returns accessors: `submitting, errorMsg, profiles, selectedProfile`
Returns commands: `setSelectedProfile, close, resolve, abort`

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Pure functions tested
- Controller tested with createRoot
- Component prop-injectable
- e2e sync-button test passes

Edge cases:
- Profile list is empty (no profiles in config)
- Fetch fails when loading profiles
- Both resolve and abort can fail with different error messages

Dependencies: None. Independent.


### Step 5: WorktreeCleanupDialog

Has state for form options (persisted to localStorage), submission, and error handling.

Current file:
- `src/components/shared/WorktreeCleanupDialog.tsx` (~135 lines)

Files to create/modify:
- CREATE `src/components/shared/worktree-cleanup-pure.ts`
- CREATE `src/components/shared/worktree-cleanup-controller.ts`
- CREATE `src/components/shared/worktree-cleanup-pure.test.ts`
- MODIFY `src/components/shared/WorktreeCleanupDialog.tsx`

Pure functions to extract into `worktree-cleanup-pure.ts`:

1. `loadCleanupOptions(): CleanupOptions` -- reads from localStorage (already a standalone function `loadOptions`).

2. `saveCleanupOptions(options: CleanupOptions): void` -- writes to localStorage (already `saveOptions`).

3. `toErrorInfo(value: string | ErrorInfo): ErrorInfo` -- already a standalone function.

4. `actionLabel(action: "archive" | "delete"): string` -- returns "Archive" or "Delete".

5. `actionButtonClass(action: "archive" | "delete"): string` -- returns the button class.

Move the `CleanupOptions` interface to the pure file.

Controller factory `createWorktreeCleanupController`:

Takes deps:
- `ticket: TicketInfo | null`
- `action: "archive" | "delete"`
- `onSubmit: (folderName: string, cleanup: CleanupOptions) => Promise<{ error?: string | ErrorInfo }>`
- `onOpenChange: (open: boolean) => void`

Returns accessors: `submitting, errorInfo, options, actionLabel`
Returns commands: `updateOption, close, handleSubmit`

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Pure functions tested (especially toErrorInfo, loadCleanupOptions edge cases)
- Component prop-injectable
- All e2e tests pass

Edge cases:
- localStorage is empty or contains invalid JSON
- `toErrorInfo` handles both string and ErrorInfo inputs
- Submit when ticket is null (should no-op)

Dependencies: None. Independent.


### Step 6: CreateTicketDialog

Simple form dialog with state for number, title, submission, and error.

Current file:
- `src/components/ticket/CreateTicketDialog.tsx` (~91 lines)

Files to create/modify:
- CREATE `src/components/ticket/create-ticket-controller.ts`
- CREATE `src/components/ticket/create-ticket-controller.test.ts`
- MODIFY `src/components/ticket/CreateTicketDialog.tsx`

Pure functions: None needed -- this dialog's logic is trivial (trim inputs, call onSubmit). The validation is just `!number().trim() || !title().trim()`, not worth extracting.

Controller factory `createCreateTicketController`:

Takes deps:
- `onSubmit: (number: string, title: string) => Promise<{ error?: string }>`
- `onOpenChange: (open: boolean) => void`
- `suggestedNextNumber?: string | null`
- `open: boolean`

Returns accessors: `number, title, submitting, errorMsg`
Returns commands: `setNumber, setTitle, close, doSubmit`

The createEffect that seeds the number from `suggestedNextNumber` stays in the controller.

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Controller tested with createRoot (doSubmit success, doSubmit error, close resets fields)
- Component prop-injectable
- e2e board-crud tests pass

Edge cases:
- Submit with blank number or title is a no-op
- onSubmit throws an exception
- onSubmit returns `{ error: "..." }`

Dependencies: None.


### Step 7: EditTicketDialog

Nearly identical structure to CreateTicketDialog.

Current file:
- `src/components/ticket/EditTicketDialog.tsx` (~87 lines)

Files to create/modify:
- CREATE `src/components/ticket/edit-ticket-controller.ts`
- CREATE `src/components/ticket/edit-ticket-controller.test.ts`
- MODIFY `src/components/ticket/EditTicketDialog.tsx`

Pure functions: None needed (same reasoning as CreateTicketDialog).

Controller factory `createEditTicketController`:

Takes deps:
- `onSubmit: (folderName: string, number: string, title: string) => Promise<{ error?: string }>`
- `onOpenChange: (open: boolean) => void`
- `ticket: TicketInfo | null`
- `open: boolean`

Returns accessors: `number, title, submitting, errorMsg`
Returns commands: `setNumber, setTitle, close, doSubmit`

The createEffect that seeds fields from `props.ticket` stays in the controller.

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Controller tested
- Component prop-injectable
- e2e board-crud tests pass

Edge cases:
- Submit when ticket is null
- Ticket changes while dialog is open

Dependencies: None.


### Step 8: DeleteTicketDialog

Minimal state dialog.

Current file:
- `src/components/ticket/DeleteTicketDialog.tsx` (~49 lines)

Files to create/modify:
- CREATE `src/components/ticket/delete-ticket-controller.ts`
- CREATE `src/components/ticket/delete-ticket-controller.test.ts`
- MODIFY `src/components/ticket/DeleteTicketDialog.tsx`

Controller factory `createDeleteTicketController`:

Takes deps:
- `onSubmit: (folderName: string) => Promise<{ error?: string }>`
- `onOpenChange: (open: boolean) => void`
- `ticket: TicketInfo | null`

Returns accessors: `submitting, errorMsg`
Returns commands: `close, doSubmit`

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Controller tested
- Component prop-injectable

Edge cases:
- Submit when ticket is null

Dependencies: None.


### Step 9: ArchiveTicketDialog

Nearly identical to DeleteTicketDialog.

Current file:
- `src/components/ticket/ArchiveTicketDialog.tsx` (~47 lines)

Files to create/modify:
- CREATE `src/components/ticket/archive-ticket-controller.ts`
- CREATE `src/components/ticket/archive-ticket-controller.test.ts`
- MODIFY `src/components/ticket/ArchiveTicketDialog.tsx`

Controller factory `createArchiveTicketController`:

Takes deps:
- `onSubmit: (folderName: string) => Promise<{ error?: string }>`
- `onOpenChange: (open: boolean) => void`
- `ticket: TicketInfo | null`

Returns accessors: `submitting, errorMsg`
Returns commands: `close, handleSubmit`

Component changes:
- Accept optional controller prop

Acceptance criteria:
- Controller tested
- Component prop-injectable

Edge cases:
- Submit when ticket is null

Dependencies: None.


### Step 10: ThemeToggle

Small component with signal and localStorage.

Current file:
- `src/components/shared/ThemeToggle.tsx` (~53 lines)

Files to create/modify:
- CREATE `src/components/shared/theme-toggle-pure.ts`
- CREATE `src/components/shared/theme-toggle-pure.test.ts`
- MODIFY `src/components/shared/ThemeToggle.tsx`

Pure functions to extract into `theme-toggle-pure.ts`:

1. `getStoredTheme(storage: { getItem(key: string): string | null }, matchesDark: boolean): "light" | "dark"` -- reads from storage and falls back to system preference. Takes storage and matchesDark as args instead of directly accessing localStorage/window for testability.

2. `nextTheme(current: "light" | "dark"): "light" | "dark"` -- toggles.

No controller needed -- ThemeToggle is simple enough that the component can call pure functions directly. The signal count is 1, which does not warrant a separate controller.

Component changes:
- Call `getStoredTheme` and `nextTheme` instead of inline logic
- No controller prop needed (too simple)

Acceptance criteria:
- `getStoredTheme` tested with all branches (stored "dark", stored "light", no stored value with dark preference, no stored value with light preference)
- `nextTheme` tested

Edge cases:
- localStorage throws (should fall back to system preference)
- SSR environment (typeof window === "undefined")

Dependencies: None.


### Step 11: Consolidate ticket dialog controllers (optional deduplication)

Steps 6-9 produce four very similar controller factories for CreateTicket, EditTicket, DeleteTicket, and ArchiveTicket. After completing those steps, evaluate whether they share enough structure to extract a shared `createFormDialogController` helper. The CLAUDE.md rule says "Do not duplicate code. Extract shared logic into reusable helpers."

If the four controllers share a common shape (submitting + errorMsg + close + doSubmit), create:

- `src/components/ticket/form-dialog-controller.ts` -- generic controller factory
- Refactor the four controllers to use it

Acceptance criteria:
- No duplicated controller boilerplate
- All tests still pass

Dependencies: Steps 6-9 must be complete first.


## Execution Order

Steps 1-10 are all independent and can be done in any order. The recommended order (largest impact first):

1. Step 1 (TicketDetailDialog) -- most complex, highest impact
2. Step 2 (ProjectPage) -- second most complex
3. Step 3 (AddProjectForm) -- moderate complexity
4. Step 4 (ConflictDialog) -- moderate
5. Step 5 (WorktreeCleanupDialog) -- moderate
6. Steps 6-9 (ticket CRUD dialogs) -- simple, do these as a batch
7. Step 10 (ThemeToggle) -- trivial
8. Step 11 (deduplication pass) -- depends on 6-9

## Global Validation

After completing all steps, run `npm run test:all` which executes:
1. `tsc` (type checking)
2. Unit tests (vitest)
3. Build
4. e2e tests (playwright)

Every step must leave the test suite green. Never skip e2e.

## File Naming Convention

Following the established patterns in the codebase:
- Pure functions: `{feature}-pure.ts`
- Controller: `{feature}-controller.ts` or `{feature}-state.ts`
- Pure function tests: `{feature}-pure.test.ts`
- Controller tests: `{feature}-controller.test.ts`
- Component: `{ComponentName}.tsx` (unchanged)

## Testing Patterns

For pure function tests, follow `agent-launcher-pure.test.ts`:
- Import from the pure module directly
- Plain `describe`/`it`/`expect`, no framework setup

For controller tests, follow `board-state.test.ts` and `agent-launcher-controller.test.ts`:
- Wrap in `createRoot(dispose => { ... dispose(); })`
- Construct controller with mock deps
- Call commands, assert on accessor values
- No DOM rendering

For render tests that already exist (like `TicketDetailDialog.test.tsx`, `KanbanBoard.render.test.tsx`), leave them as-is -- they verify DOM output, not state logic.
