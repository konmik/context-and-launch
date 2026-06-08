# ST-0003 Implementation Plan: Hot Keys on Buttons and Dialogs

## Background

This plan adds Mod+Enter (Ctrl+Enter on Windows/Linux, Cmd+Enter on macOS) as a keyboard shortcut to trigger the primary action button in all dialogs. The codebase is a SolidJS application using SolidStart. There are 8 specific dialog surfaces that need the shortcut, plus a reusable hook/utility to keep the pattern DRY.

## Architecture Decision

Create a single reusable utility function `useModEnterSubmit` that registers a document-level `keydown` listener (matching the ResizableWindow Escape pattern) and calls a provided action callback when Mod+Enter is pressed and the action is not disabled. Each dialog will call this utility, passing its submit function and a disabled-check accessor.

For stacked dialogs, only the topmost dialog should respond. The utility will call `e.preventDefault()` when it fires, stopping lower dialogs from also responding. Because document-level listeners fire in registration order (most recently added = topmost dialog), and the topmost dialog's listener calls `preventDefault()`, lower dialogs check `e.defaultPrevented` and skip.

A companion utility function `modEnterHint` returns the platform-appropriate string ("Cmd+Enter" or "Ctrl+Enter") for use in `title` attributes on primary buttons.

---

## Step 1: Create the useModEnterSubmit utility

File to create: `src/lib/use-mod-enter-submit.ts`

This module exports two things:

1. `useModEnterSubmit(options: { onSubmit: () => void; disabled: () => boolean; active: () => boolean })` -- A function that uses `createEffect` and `onCleanup` to manage a document-level `keydown` listener. The listener checks:
   - `e.defaultPrevented` -- if true, a higher dialog already handled it, so return
   - `e.key === "Enter"` and `(e.metaKey || e.ctrlKey)` -- the Mod+Enter combo
   - `active()` -- the dialog is currently open
   When all conditions pass, call `e.preventDefault()` and `e.stopPropagation()`. Then if `!disabled()`, call `onSubmit()`. Always consume the event when the topmost dialog is active to prevent lower dialogs from firing.

2. `modEnterHint()` -- Returns `"Cmd+Enter"` on macOS and `"Ctrl+Enter"` on Windows/Linux. Uses `navigator.platform` or `navigator.userAgentData?.platform` to detect macOS.

Acceptance criteria:
- Listener added when `active()` becomes true, removed when false or on cleanup
- `e.defaultPrevented` checked first for stacked dialog support
- Always preventDefault when active, even if disabled (prevents lower dialogs from firing)
- Only call onSubmit when not disabled

---

## Step 2: Add Mod+Enter to CreateTicketDialog

File to modify: `src/components/CreateTicketDialog.tsx`

Changes:
1. Import `useModEnterSubmit` and `modEnterHint` from `~/lib/use-mod-enter-submit`
2. Extract submit logic from `handleSubmit` into `doSubmit()`
3. Call `useModEnterSubmit` with disabled: `() => submitting() || !number().trim() || !title().trim()`, active: `() => props.open`
4. Add `title={modEnterHint()}` to the "Create" submit button

Acceptance criteria:
- Ctrl+Enter when dialog open and fields filled triggers submission
- Ctrl+Enter when fields empty or during submission does nothing
- Tooltip shows "Ctrl+Enter" (or "Cmd+Enter") on hover

Dependencies: Step 1

---

## Step 3: Add Mod+Enter to EditTicketDialog

File to modify: `src/components/EditTicketDialog.tsx`

Same pattern as Step 2:
1. Import utilities
2. Extract submit logic into `doSubmit()`
3. Call `useModEnterSubmit` with disabled: `() => submitting() || !number().trim() || !title().trim()`, active: `() => props.open`
4. Add `title={modEnterHint()}` to the "Save" button

Dependencies: Step 1

---

## Step 4: Add Mod+Enter to DeleteTicketDialog

File to modify: `src/components/DeleteTicketDialog.tsx`

1. Import utilities
2. Extract submit logic into `doSubmit()`
3. Call `useModEnterSubmit` with disabled: `() => submitting()`, active: `() => props.open && !!props.ticket`
4. Add `title={modEnterHint()}` to the "Delete" button

Dependencies: Step 1

---

## Step 5: Add Mod+Enter to TicketDetailDialog sub-dialogs

File to modify: `src/components/TicketDetailDialog.tsx`

Three sub-dialog surfaces:

5a. DiscardConfirmation component:
- `onSubmit`: calls `props.onDiscard`
- `disabled`: `() => false` (Discard button is never disabled)
- `active`: `() => props.open`
- Add `title={modEnterHint()}` to the "Discard" button

5b. New File dialog (inline `<Show when={newFileDialogOpen()}>` block):
- `onSubmit`: calls `submitNewFile`
- `disabled`: `() => !newFileName().trim()`
- `active`: `() => newFileDialogOpen()`
- Add `title={modEnterHint()}` to the "Create" button

5c. Delete File dialog (inline `<Show when={confirmingDelete()}>` block):
- `onSubmit`: calls `deleteFile`
- `disabled`: `() => false`
- `active`: `() => confirmingDelete()`
- Add `title={modEnterHint()}` to the "Delete" button

Note: TicketDetailDialog itself has NO Mod+Enter handler (PRD says it has no primary action button).

Acceptance criteria:
- Mod+Enter triggers correct action in each sub-dialog
- Mod+Enter does nothing when only TicketDetailDialog is open with no sub-dialog
- Tooltips appear on all four primary buttons (Discard appears twice -- close and file-switch confirmations)

Dependencies: Step 1

---

## Step 6: Add Mod+Enter to LauncherSettings form dialog

File to modify: `src/components/LauncherSettings.tsx`

The template/skill form sub-dialog (`<Show when={form()}>` block at z-[60]):
- `onSubmit`: calls `submitForm`
- `disabled`: `() => !form()?.name.trim()`
- `active`: `() => !!form()`
- Add `title={modEnterHint()}` to the "Add"/"Save" button

Note: Main LauncherSettings dialog has no primary action button, so no Mod+Enter handler.

Dependencies: Step 1

---

## Step 7: Add Mod+Enter to Add Project dialog

Files to modify:
- `src/components/AddProjectForm.tsx` -- Add optional `submitTitle` prop, apply as `title` on submit button
- `src/routes/project/[slug].tsx` -- Add Mod+Enter handler and pass `submitTitle={modEnterHint()}`

In `[slug].tsx`:
- Use a ref on the dialog container div
- `onSubmit`: find the form element via ref and call `requestSubmit()`
- `disabled`: `() => false` (form's own onSubmit guards handle validation)
- `active`: `() => addProjectDialogOpen()`

The AddProjectForm gets an optional `submitTitle` prop so the tooltip only appears when used as a dialog (not on the standalone add-project page).

Dependencies: Step 1

---

## File Summary

Files to create:
- `src/lib/use-mod-enter-submit.ts`

Files to modify:
- `src/components/CreateTicketDialog.tsx`
- `src/components/EditTicketDialog.tsx`
- `src/components/DeleteTicketDialog.tsx`
- `src/components/TicketDetailDialog.tsx`
- `src/components/LauncherSettings.tsx`
- `src/components/AddProjectForm.tsx`
- `src/routes/project/[slug].tsx`

Files unchanged:
- `src/components/ResizableWindow.tsx` -- Escape handler only, no changes needed
- `src/components/MarkdownEditor.tsx` -- No Mod+Enter binding exists in CodeMirror setup

---

## Validation Checklist

1. Run `tsc --noEmit` to verify type correctness
2. Run `vitest run` to verify existing tests pass
3. Manual testing matrix:
   - Open each dialog, press Ctrl+Enter, verify primary action fires
   - Open each dialog with disabled state, press Mod+Enter, verify nothing happens
   - Open TicketDetailDialog with no sub-dialog, press Mod+Enter, verify nothing happens
   - Open TicketDetailDialog then open a sub-dialog, press Mod+Enter, verify only sub-dialog action fires
   - Open LauncherSettings without form sub-dialog, press Mod+Enter, verify nothing happens
   - Open LauncherSettings form sub-dialog, press Mod+Enter, verify save/add fires
   - Hover over every primary action button, verify tooltip shows correct platform-specific shortcut
   - While editing in CodeMirror, press Mod+Enter, verify no editor side effect
