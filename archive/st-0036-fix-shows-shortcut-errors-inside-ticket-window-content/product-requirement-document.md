## Problem Statement

When an error occurs in the Ticket Detail Dialog (shortcut failure, file load/save error, upload error, etc.), the error message is rendered as an inline banner that expands to fill the dialog body, pushing or completely replacing the actual content. The same problem exists in LauncherSettings, where error banners at the top of the panel obscure the settings content. This makes the app unusable when errors occur.

## Solution

Replace all content-replacing inline error banners with the existing ErrorDialog modal. When an error occurs, a dialog pops up showing the error details without disturbing the underlying content. The user dismisses it and continues working.

## Implementation Decisions

- Reuse the existing ErrorDialog component and ErrorInfo type. No new components needed.
- Three sites to convert:
  - TicketDetailDialog: the shared error banner above tab content (serves all three tabs: editor, agent launcher, shortcuts)
  - LauncherSettings: the top-level error banner
  - LauncherSettings columns tab: the column error banner
- Convert string error signals (`createSignal("")`) to ErrorInfo signals (`createSignal<ErrorInfo | null>(null)`) at each site.
- Closing the ErrorDialog clears the error signal to null. The error is gone once dismissed.
- Use errorPayload() to populate full ErrorInfo (description, command, output) whenever possible. For plain string errors or non-ProcessError exceptions, only description is populated.
- The server-side runShortcut function currently returns `{ ok: false, type: "error", message: string }` via errorResult(). Change it (and similar server functions) to return ErrorInfo-shaped payloads using errorPayload() so the client can display command and output when available.
- The ShortcutDeps interface changes from `setError: (msg: string) => void` to `setError: (error: ErrorInfo) => void`. Same for any other module that feeds into a converted error signal.
- Form dialog inline errors (CreateTicket, EditTicket, DeleteTicket, ArchiveTicket, DeleteProject, AddProjectForm, ConflictDialog) stay as-is. They have designated error areas inside their dialogs and do not replace content.
- ErrorBanner inside settings sub-dialogs (ColumnFormDialog, RenameColumnDialog, BoardFormDialog) stays as-is for the same reason.
- WorktreeCleanupDialog error display stays as-is. It has a designated area.
- The errorResult() utility may need an errorInfoResult() counterpart that returns ErrorInfo instead of a plain message string.

## Out of Scope

- Adding a toast/notification system.
- Changing form dialog validation error display.
- Changing board-level state indicators (orphan column, sync conflict badge).
- Changing route-level error states (project not found, project unavailable).
- Changing the ErrorDialog component itself (its current design is adequate).

## Further Notes

- The ErrorDialog already handles scrollable output with max-height, so long error messages and process output are displayed correctly.
- Existing e2e tests for error-dialog and ticket-detail-shortcuts-tab will need updating to reflect the new error display mechanism.
- The agent launcher (AgentLauncher.tsx) already uses ErrorDialog with full ErrorInfo via errorPayload(). Use that as the reference pattern.
