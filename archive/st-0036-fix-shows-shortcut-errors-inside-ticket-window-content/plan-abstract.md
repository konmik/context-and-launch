## Abstractions

Structured error channel: every error path feeding a content-area display carries ErrorInfo (description, command, output) instead of a bare string. The discriminator for which display mechanism to use is whether the error obscures primary content (ErrorDialog modal) or has a designated inline area inside a form dialog (ErrorBanner, unchanged).

ErrorInfo signal: component-level error state changes from `Signal<string>` to `Signal<ErrorInfo | null>`. Null means no error. Non-null opens ErrorDialog. Dismissing the dialog clears to null. This replaces the current pattern where truthy-string means error and empty-string means no error.

errorInfoResult: a server-side utility paralleling errorResult. Where errorResult flattens any error into `{ ok: false, type: "error", message: string }` (losing ProcessError detail), errorInfoResult preserves structured detail via `{ ok: false, type: "error", errorInfo: ErrorInfo }`. Uses errorPayload internally to extract command and output from ProcessError.

## Boundaries

Server to client: server functions return ErrorInfo objects via errorInfoResult. The client receives structured data without parsing strings. This is the same pattern worktreeCleanup in ticket-api.ts already uses (the only server function currently returning ErrorInfo).

Module to component: interfaces like ShortcutDeps carry ErrorInfo through setError, not strings. Modules produce structured error data without knowing about ErrorDialog.

Component to dialog: components hold the ErrorInfo signal and conditionally render ErrorDialog. ErrorDialog's interface is unchanged.

## Points of resistance

### 1. TicketDetailDialog error signal has many writers

The setError signal in TicketDetailDialog is called from: createShortcutState, createHeaderEditState, createFileUploadState, and at least nine direct call sites in ticket-detail-state.ts (context loading, file saving, launcher config loading, worktree persistence, file deletion, native file browser, reference addition, column default saving).

All currently call setError(string). Converting to setError(ErrorInfo) requires changing every call site.

Resolution: mechanical conversion. Each call site wraps its string in `{ description: msg }`. For shortcut errors that come from server functions returning errorInfoResult, the full ErrorInfo object passes through. The width of the change is acceptable because every call site follows the same trivial pattern.

### 2. LauncherSettings columnError signal may be shared with form dialogs

The exploration shows columnError is passed to ColumnFormDialog, RenameColumnDialog, and BoardFormDialog where it is displayed via the ErrorBanner helper. The PRD says form dialog errors stay as-is with ErrorBanner. If both the tab-level banner and the form dialogs share a single string signal, converting it to ErrorInfo breaks the form dialogs.

Resolution: split the signal if shared. The tab-level error becomes `Signal<ErrorInfo | null>` for ErrorDialog. Form dialogs own their own error strings and keep ErrorBanner. If the form dialogs already have independent error state, no split is needed -- verify during implementation.

### 3. runShortcut uses errorResult, discarding ProcessError detail

runShortcut catches errors and calls errorResult(e), which flattens ProcessError (with its command and output fields) into a single message string. By the time the client receives the error, the structured detail is gone.

Resolution: change runShortcut to use errorInfoResult(e), returning `{ ok: false, type: "error", errorInfo: ErrorInfo }`. When the underlying error is a ProcessError, the client gets command and output for display in ErrorDialog. The same change applies to any other server function at the three conversion sites that currently uses errorResult.

### 4. launchAgentAction also uses errorResult

The AgentLauncher is the reference pattern for ErrorDialog usage, yet its server function (launchAgentAction) uses errorResult and returns only a string message. The controller constructs ErrorInfo with only description populated -- command and output are never shown for agent launch errors.

Resolution: convert launchAgentAction to errorInfoResult as well so agent launch errors can show process detail. This is not strictly required by the PRD (AgentLauncher already works) but follows from generalizing the server error contract. If this feels like scope creep, defer it -- AgentLauncher already uses ErrorDialog and works today.

Changed approach: defer launchAgentAction conversion. It works today and the PRD does not mention it. Stay within the three sites.

### 5. ensureLaunchDir returns typed results, not errorResult

The runShortcut function also has a pre-launch check (ensureLaunchDir) that returns `{ ok: false, type: string, message: string }` for specific failure modes (dirtyWorktree, etc.). These are not generic errors -- they are typed results that trigger UI flows (e.g., showing a confirmation dialog).

Resolution: leave ensureLaunchDir return values alone. Only convert the catch-block error path where errorResult is called. The typed pre-launch failures use their own types and the client handles them by type, not as errors.

## Seams-first sequence

### Step 1: Add errorInfoResult utility (pure addition, no callers)

Add to src/core/shared/errors.ts:
- `errorInfoResult(e: unknown): { ok: false; type: "error"; errorInfo: ErrorInfo }`
- Internally calls errorPayload(e) to construct ErrorInfo
- Parallel to existing errorResult, strictly additive

Verification: existing tests pass, nothing changes behavior.

### Step 2: Convert runShortcut server function to return ErrorInfo

Change the catch block in runShortcut (src/components/launcher/launcher-api.ts) from errorResult(e) to errorInfoResult(e).

Update caller in ticket-detail-shortcuts.ts to read result.errorInfo instead of result.message for the error case.

This is a seam change: the server contract widens from string to ErrorInfo. The caller adapts to read the new field.

Verification: shortcut error path still works; the data shape changes but the flow does not.

### Step 3: Convert TicketDetailDialog error signal and display

Change signal from createSignal("") to createSignal<ErrorInfo | null>(null).

Widen ShortcutDeps.setError from (msg: string) to (error: ErrorInfo) => void. Update createShortcutState to pass ErrorInfo from server result.

Convert all other setError call sites in ticket-detail-state.ts, createHeaderEditState, and createFileUploadState to produce ErrorInfo: `setError({ description: msg })`.

Replace the inline error banner JSX in TicketDetailDialog.tsx with ErrorDialog:
- Remove the Show/div banner
- Add `<ErrorDialog error={error()} onClose={() => setError(null)} />`

Verification: errors in any tab open a dismissible modal instead of an inline banner. Content stays visible underneath.

### Step 4: Convert LauncherSettings top-level error signal and display

Change top-level error signal from createSignal("") to createSignal<ErrorInfo | null>(null).

Convert all setError call sites to produce ErrorInfo.

Replace inline banner with ErrorDialog.

Verification: settings-level errors open a modal.

### Step 5: Convert LauncherSettings columns tab error

Determine whether columnError is shared with form dialogs. If shared, split: create a separate string signal for form dialog errors and keep the form-dialog ErrorBanner on that signal. Convert the tab-level columnError to Signal<ErrorInfo | null> and display with ErrorDialog.

If already separate, just convert the tab-level signal and swap the banner for ErrorDialog.

Verification: column tab errors open a modal. Form dialog errors still show inline.

### Step 6: Update tests

Update e2e tests for error-dialog and ticket-detail-shortcuts-tab to assert on ErrorDialog (modal presence, dismissal) instead of inline error text.

Update any unit tests in ticket-detail-shortcuts or launcher-settings that assert on string error signals.
