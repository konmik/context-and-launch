## Step 1: Add errorInfoResult utility

File to modify: `src/core/shared/errors.ts`

Add a new exported function `errorInfoResult` after the existing `errorPayload` function:

```
export function errorInfoResult(e: unknown) {
  return { ok: false as const, type: "error" as const, errorInfo: errorPayload(e) };
}
```

This parallels `errorResult` but returns `{ ok: false, type: "error", errorInfo: ErrorInfo }` instead of `{ ok: false, type: "error", message: string }`. It calls `errorPayload(e)` internally, preserving ProcessError command/output detail.

No callers yet. Purely additive.

Acceptance criteria:
- `npm run test:all` passes with no changes to behavior.
- The function is exported and importable.


## Step 2: Convert runShortcut server function to return ErrorInfo

File to modify: `src/components/launcher/launcher-api.ts`

In the imports, add `errorInfoResult` alongside the existing `errorResult` import from `~/core/shared/errors.js`:
```
import { ValidationError, errorResult, errorInfoResult } from "~/core/shared/errors.js";
```

In the `runShortcut` function (line 239 in current file), change the catch block from:
```
return errorResult(e);
```
to:
```
return errorInfoResult(e);
```

This changes the error return shape of `runShortcut` from `{ ok: false, type: "error", message: string }` to `{ ok: false, type: "error", errorInfo: ErrorInfo }`. The `ensureLaunchDir` early-return paths (`type: "dirtyWorktree"` etc.) remain unchanged since they have their own typed returns with `message`.

Acceptance criteria:
- The `runShortcut` function returns ErrorInfo in its catch block.
- No other server functions in this file are changed.
- `npm run test:all` passes (callers adapted in Step 3).


## Step 3: Convert TicketDetailDialog error signal from string to ErrorInfo

### 3a: Update ticket-detail-shortcuts.ts (ShortcutDeps and createShortcutState)

File to modify: `src/components/ticket-detail/ticket-detail-shortcuts.ts`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the `ShortcutDeps` interface `setError` from:
```
setError: (msg: string) => void;
```
to:
```
setError: (error: ErrorInfo | null) => void;
```

In `createShortcutState`, function `runShortcut`:
- Change `deps.setError("")` (line 20) to `deps.setError(null)`. This clears the previous error before running a new shortcut.
- Change the error-case line `deps.setError(result.message)` (line 30) to `deps.setError(result.errorInfo)`. This now passes the full ErrorInfo from the server.
- Change the catch-block `deps.setError(e?.message ?? "Network error")` (line 33) to `deps.setError({ description: e instanceof Error ? e.message : "Network error" })`.

### 3b: Update ticket-detail-header.ts (HeaderEditDeps)

File to modify: `src/components/ticket-detail/ticket-detail-header.ts`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the `HeaderEditDeps` interface `setError` from:
```
setError: (msg: string) => void;
```
to:
```
setError: (error: ErrorInfo | null) => void;
```

In `createHeaderEditState`, function `saveTicketHeader`:
- Change `deps.setError(result.message)` (line 32) to `deps.setError({ description: result.message })`.

### 3c: Update ticket-detail-upload.ts (FileUploadDeps)

File to modify: `src/components/ticket-detail/ticket-detail-upload.ts`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the `FileUploadDeps` interface `setError` from:
```
setError: (msg: string) => void;
```
to:
```
setError: (error: ErrorInfo | null) => void;
```

In `createFileUploadState`, convert all `deps.setError(string)` calls to `deps.setError({ description: string })` and clearing calls to `deps.setError(null)`:
- Line 53: `deps.setError("Cannot overwrite status.json")` becomes `deps.setError({ description: "Cannot overwrite status.json" })`.
- Line 68: `deps.setError("")` (clearing) becomes `deps.setError(null)`.
- Line 72: `deps.setError(result.message)` becomes `deps.setError({ description: result.message })`.
- Line 81: `deps.setError(r.error || ...)` becomes `deps.setError({ description: r.error || \`Failed to upload ${r.name}\` })`.
- Line 88: `deps.setError(e instanceof Error ? e.message : "Upload failed")` becomes `deps.setError({ description: e instanceof Error ? e.message : "Upload failed" })`.

### 3d: Update ticket-detail-state.ts (error signal and all setError call sites)

File to modify: `src/components/ticket-detail/ticket-detail-state.ts`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the error signal declaration (line 56) from:
```
const [error, setError] = createSignal("");
```
to:
```
const [error, setError] = createSignal<ErrorInfo | null>(null);
```

Convert every `setError(string)` call to `setError(ErrorInfo)` and every `setError("")` (clearing) call to `setError(null)`:

Clearing calls (change from `setError("")` to `setError(null)`):
- Line 112: `if (!result.ok) setError(result.message)` becomes `if (!result.ok) setError({ description: result.message })`.
- Line 114: catch block becomes `setError({ description: err instanceof Error ? err.message : "Failed to persist worktree setting" })`.
- Line 170: `setError(e instanceof Error ? e.message : "Failed to load file")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to load file" })`.
- Line 188: `setError(e instanceof Error ? e.message : "Failed to load file")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to load file" })`.
- Line 208: `setError(e instanceof Error ? e.message : "Failed to load launcher config")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to load launcher config" })`.
- Line 219: `if (!result.ok) setError(result.message)` becomes `if (!result.ok) setError({ description: result.message })`.
- Line 222: catch block becomes `setError({ description: e instanceof Error ? e.message : "Failed to save column defaults" })`.
- Line 227: `setError("")` becomes `setError(null)`.
- Line 255: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 256: catch block becomes `setError({ description: e instanceof Error ? e.message : "Failed to save file" })`.
- Line 324, 327, 330: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 341: `setError(e instanceof Error ? e.message : "Failed to delete")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to delete" })`.
- Line 356: `setError("")` becomes `setError(null)`.
- Line 369: `setError(e instanceof Error ? e.message : "Failed to open file dialog")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to open file dialog" })`.
- Line 374, 375: `setError("")` becomes `setError(null)`.
- Line 379: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 387: `setError(e instanceof Error ? e.message : "Failed to add references")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to add references" })`.

The exact line numbers may shift as edits are applied; the pattern is mechanical: every `setError("some string")` becomes `setError({ description: "some string" })`, every `setError(variable.message)` becomes `setError({ description: variable.message })`, and every `setError("")` becomes `setError(null)`.

### 3e: Update TicketDetailDialog.tsx (replace inline banner with ErrorDialog)

File to modify: `src/components/ticket-detail/TicketDetailDialog.tsx`

Add import:
```
import ErrorDialog from "../shared/ErrorDialog.js";
```

Remove the inline error banner (lines 166-168):
```
<Show when={s.error()}>
  <div class="mx-6 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{s.error()}</div>
</Show>
```

Add the ErrorDialog at the end of the component, after the existing dialogs (before the closing `</Show>` and `</>` at the bottom), alongside the other dialogs:
```
<ErrorDialog error={s.error()} onClose={() => s.setError(null)} />
```

The `s.error()` return type is now `ErrorInfo | null`. When non-null, ErrorDialog opens as a modal. The user clicks OK to dismiss, which calls `s.setError(null)`.

Note: `setError` is not currently exposed in the return value of `createTicketDetailState`. It must be added to the return object. Add `setError` to the return statement in `ticket-detail-state.ts` (alongside the existing `error`). Currently line 410 has `error,` -- after it add `setError,`.

Acceptance criteria:
- The inline error banner is gone from TicketDetailDialog.
- Errors from any source (shortcuts, file operations, header save, upload, config load) open an ErrorDialog modal.
- Shortcut errors from ProcessError display command and output in the dialog.
- Dismissing the dialog clears the error and the dialog disappears.
- The underlying content (editor, launcher, shortcuts tabs) remains visible behind/underneath the dialog.
- `npm run test:all` passes.


## Step 4: Convert LauncherSettings top-level error signal to ErrorInfo

### 4a: Update launcher-settings-state.ts (error signal)

File to modify: `src/components/launcher/launcher-settings-state.ts`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the error signal declaration (line 34) from:
```
const [error, setError] = createSignal("");
```
to:
```
const [error, setError] = createSignal<ErrorInfo | null>(null);
```

Convert all `setError(string)` calls to `setError(ErrorInfo)` and all `setError("")` to `setError(null)`. The affected call sites are:

Clearing calls -- change `setError("")` to `setError(null)`:
- Line 84: `setError("")` in `loadConfig`
- Line 119: `setError("")` in `submitForm`
- Line 141: `setError("")` in `deleteItemFn`
- Line 149: `setError("")` in `saveProjectNameFn`
- Line 157: `setError("")` in `saveWorktreeRootPathFn`
- Line 165: `setError("")` in `saveBranchPrefixFn`
- Line 175: `setError("")` in `saveConflictResolutionFn`
- Line 279: `setError("")` in `handleBoardIdChange`
- Line 335: `setError("")` in `saveSkillOrderFn`

Error calls -- change `setError(message)` to `setError({ description: message })`:
- Line 94: `setError(e instanceof Error ? e.message : "Failed to load config")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to load config" })`.
- Line 103: `setError(e instanceof Error ? e.message : "Failed to load boards")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to load boards" })`.
- Line 130, 133: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 136: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 143: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 145: `setError(e instanceof Error ? e.message : "Failed to delete")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to delete" })`.
- Line 152: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 153: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 160: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 162: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 169: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 171: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 179: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 181: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 282: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 284: `setError(e instanceof Error ? e.message : "Failed to save")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to save" })`.
- Line 338: `setError(result.message)` becomes `setError({ description: result.message })`.
- Line 340: `setError(e instanceof Error ? e.message : "Failed to reorder")` becomes `setError({ description: e instanceof Error ? e.message : "Failed to reorder" })`.

### 4b: Update MiscTab setError prop type

File to modify: `src/components/launcher/launcher-settings-misc-tab.tsx`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the `setError` prop type from:
```
setError: (v: string) => void;
```
to:
```
setError: (v: ErrorInfo | null) => void;
```

In the `MiscTab` component, convert the two `props.setError(string)` calls (lines 68-73):
- `props.setError(result.error)` becomes `props.setError({ description: result.error })`.
- `props.setError(e instanceof Error ? e.message : "Failed to pick directory")` becomes `props.setError({ description: e instanceof Error ? e.message : "Failed to pick directory" })`.

### 4c: Update LauncherSettings.tsx (replace inline banner with ErrorDialog)

File to modify: `src/components/launcher/LauncherSettings.tsx`

Add import:
```
import ErrorDialog from "../shared/ErrorDialog.js";
```

Remove the inline error banner (lines 126-129):
```
<Show when={s.error()}>
  <div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
    {s.error()}
  </div>
</Show>
```

Add the ErrorDialog at the end of the component, after the existing dialogs (before the closing `</>` at the end):
```
<ErrorDialog error={s.error()} onClose={() => s.setError(null)} />
```

Acceptance criteria:
- The inline error banner is gone from LauncherSettings.
- Top-level settings errors (config load, save, delete, reorder) open an ErrorDialog modal.
- Dismissing the dialog clears the error.
- `npm run test:all` passes.


## Step 5: Convert LauncherSettings columns tab error to ErrorInfo

The `columnError` signal in `launcher-settings-state.ts` is shared: it is passed to ColumnsTab (tab-level inline banner), and also to ColumnFormDialog, RenameColumnDialog, and BoardFormDialog (form-dialog inline banners via ErrorBanner). Per the PRD, form dialog errors must stay inline. Therefore the signal must be split.

### 5a: Split columnError into two signals

File to modify: `src/components/launcher/launcher-settings-state.ts`

Replace the single signal:
```
const [columnError, setColumnError] = createSignal("");
```

With two signals:
```
const [columnError, setColumnError] = createSignal<ErrorInfo | null>(null);
const [columnDialogError, setColumnDialogError] = createSignal("");
```

`columnError` (now `ErrorInfo | null`) is the tab-level error, shown via ErrorDialog.
`columnDialogError` (string) is for form dialogs, shown via ErrorBanner (unchanged).

Determine which call sites write tab-level errors vs. form-dialog errors. The rule: if the error occurs inside a form dialog handler that the user is interacting with (handleSaveColumn, handleRenameColumn, handleCreateBoard, handleDeleteBoard, handleDeleteColumn), it should go to `columnDialogError` so the user sees it inline in the dialog they have open. If the error occurs outside a dialog (handleReorderColumns), it should go to `columnError` (ErrorDialog).

Convert call sites:

Form-dialog errors -- change from `setColumnError(msg)` to `setColumnDialogError(msg)` (these keep string type):
- `handleCreateBoard`: `setColumnError("")` becomes `setColumnDialogError("")`, `setColumnError(result.message)` becomes `setColumnDialogError(result.message)`, catch becomes `setColumnDialogError(...)`.
- `handleDeleteBoard`: same pattern.
- `handleSaveColumn`: same pattern. Both the edit and add branches.
- `handleRenameColumn`: same pattern. All `setColumnError(...)` calls become `setColumnDialogError(...)`.
- `handleDeleteColumn`: same pattern.

Tab-level errors -- change from `setColumnError(msg)` to `setColumnError(ErrorInfo)`:
- `handleReorderColumns`: `setColumnError(result.message)` becomes `setColumnError({ description: result.message })`, catch becomes `setColumnError({ description: ... })`. The clearing `setColumnError("")` does not exist here currently.

Also clear `columnDialogError` when dialogs open. Currently the ColumnsTab calls `props.setColumnError("")` before opening add/edit column forms. Those clearing calls should clear `columnDialogError` instead. These are in `launcher-settings-columns-tab.tsx` (lines 79, 121).

Add `columnDialogError` and `setColumnDialogError` to the return object.

### 5b: Update ColumnsTab component

File to modify: `src/components/launcher/launcher-settings-columns-tab.tsx`

Add import:
```
import type { ErrorInfo } from "~/core/shared/errors.js";
```

Change the `columnError` prop type from `string` to `ErrorInfo | null`.

Add new props:
```
columnDialogError: string;
setColumnDialogError: (v: string) => void;
```

Remove the inline banner for `columnError` (lines 29-33):
```
<Show when={props.columnError}>
  <div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
    {props.columnError}
  </div>
</Show>
```

The tab-level error is now handled by ErrorDialog at the LauncherSettings level (added in Step 4c) -- no, actually, `columnError` is separate from `error`. We need to add an ErrorDialog for `columnError` specifically. Add it in the ColumnsTab:
```
<ErrorDialog error={props.columnError} onClose={() => {/* need a setter */}} />
```

Wait -- the ColumnsTab does not have `setColumnError`. It receives `setColumnError` as a prop. So either: (a) add the ErrorDialog in ColumnsTab with the setter prop, or (b) add it in LauncherSettings.tsx alongside the other ErrorDialog. Option (b) is cleaner since LauncherSettings already imports ErrorDialog.

So in `launcher-settings-columns-tab.tsx`, just remove the inline banner. The ErrorDialog for `columnError` will be added in LauncherSettings.tsx.

Change the two calls to `props.setColumnError("")` (clearing before dialog open) to `props.setColumnDialogError("")`:
- Line 79: `props.setColumnError("")` becomes `props.setColumnDialogError("")`.
- Line 121: `props.setColumnError("")` becomes `props.setColumnDialogError("")`.

### 5c: Update LauncherSettings.tsx for columnError ErrorDialog and columnDialogError props

File to modify: `src/components/launcher/LauncherSettings.tsx`

Add a second ErrorDialog for column errors (after the one added in Step 4c):
```
<ErrorDialog error={s.columnError()} onClose={() => s.setColumnError(null)} />
```

Update the ColumnsTab props to pass the new `columnDialogError` signal:
```
columnError={s.columnError()}        // now ErrorInfo | null (only used for ErrorDialog)
setColumnError={s.setColumnError}    // keep for reference but no longer used in ColumnsTab
columnDialogError={s.columnDialogError()}
setColumnDialogError={s.setColumnDialogError}
```

Actually, since ColumnsTab no longer uses `columnError` (the inline banner is removed and the ErrorDialog is in LauncherSettings), the `columnError` and `setColumnError` props can be removed from ColumnsTab. Only `setColumnDialogError` is needed (for clearing before dialog open).

Simplify: remove `columnError` and `setColumnError` from ColumnsTab props. Keep `setColumnDialogError` for the clearing calls. Update the ColumnsTab component interface accordingly.

Update the form dialog props in LauncherSettings.tsx to use `columnDialogError` instead of `columnError`:
- `ColumnFormDialog`: change `columnError={s.columnError()}` to `columnError={s.columnDialogError()}`.
- `RenameColumnDialog`: change `columnError={s.columnError()}` to `columnError={s.columnDialogError()}`.
- `BoardFormDialog`: change `columnError={s.columnError()}` to `columnError={s.columnDialogError()}`.

### 5d: Update ColumnsTab prop types

File to modify: `src/components/launcher/launcher-settings-columns-tab.tsx`

Remove from the props interface:
```
columnError: string;
setColumnError: (v: string) => void;
```

Add to the props interface:
```
setColumnDialogError: (v: string) => void;
```

Acceptance criteria:
- Column tab errors (reorder) open an ErrorDialog modal.
- Form dialog errors (add/edit/delete column, add/delete board, rename column) still show inline via ErrorBanner inside their respective dialogs.
- Dismissing the ErrorDialog clears the column error.
- `npm run test:all` passes.


## Step 6: Update tests

### 6a: Update TicketDetailDialog.test.tsx

File to modify: `src/components/ticket/TicketDetailDialog.test.tsx`

The unit tests do not currently test error display directly (no assertions on error banners or error text). However, the mock for `runShortcut` returns `{ ok: true }`. If any test were to trigger an error path, the error signal type change would matter. Review and ensure the mocks remain compatible. The `runShortcut` mock on line 45 returns `{ ok: true }` which has no `message` or `errorInfo` field, so it is compatible. No changes needed unless tests fail.

### 6b: Update e2e error-dialog test

File to modify: `e2e/error-dialog.test.ts`

The existing test triggers ErrorDialog via sync failure, not via the ticket detail dialog. This test should still pass as-is since the sync error path is unchanged. No modifications needed.

### 6c: Update e2e ticket-detail-shortcuts-tab test

File to modify: `e2e/ticket-detail-shortcuts-tab.test.ts`

The existing tests do not assert on error display. The first test checks that a server request is made when clicking the run button. The second checks that dirty-worktree dialog testids are absent on the happy path. Both should pass without changes.

However, add a new test that verifies shortcut errors appear in ErrorDialog rather than inline:

Add a test case that creates a project with a shortcut whose command will fail (e.g., a nonexistent command), runs it, and asserts:
- `[data-testid="error-dialog-ok"]` becomes visible (proving ErrorDialog appeared).
- Click OK dismisses the dialog (`error-dialog-ok` detaches).
- The shortcuts tab content is still visible underneath.

```
it("shortcut error opens ErrorDialog instead of inline banner", async () => {
  const project = await createProject(ctx.testServer, {
    projectSlug: uniqueSlug("tds-err"),
    withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    appLauncherConfig: {
      templates: [], skills: [], profiles: [],
      shortcuts: [{ name: "Fail", command: "nonexistent-command-xyz" }],
    },
  });
  ctx.projects.push(project);
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  await openTicketDetail(ctx.page, "t-1-alpha");
  await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
  await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
    state: "visible", timeout: 15000,
  });
  await ctx.page.click('[data-testid="ticket-detail-shortcuts-run-button"]');
  await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
    state: "visible", timeout: 20000,
  });
  await ctx.page.click('[data-testid="error-dialog-ok"]');
  await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
    state: "detached", timeout: 15000,
  });
  // Shortcuts tab content still visible
  await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
    state: "visible", timeout: 5000,
  });
}, 60000);
```

### 6d: Verify all tests pass

Run `npm run test:all` (tsc + unit + build + e2e). Fix any type errors or assertion failures that surface from the signal type changes.

Acceptance criteria:
- All existing tests pass.
- The new e2e test passes.
- No TypeScript errors.
