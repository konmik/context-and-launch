# ST-0003: Hot Keys on Buttons and Dialogs

## Goal

Add Mod+Enter (Ctrl+Enter on Windows/Linux, Cmd+Enter on macOS) as a keyboard shortcut to trigger the primary action button in all dialogs. Escape to close already works and needs no changes.

## Dialogs in Scope

Every dialog that has a primary action button:

1. CreateTicketDialog — "Create" button
2. EditTicketDialog — "Save" button
3. DeleteTicketDialog — "Delete" button
4. TicketDetailDialog > DiscardConfirmation — "Discard" button
5. TicketDetailDialog > New File dialog — "Create" button
6. TicketDetailDialog > Delete File dialog — "Delete" button
7. LauncherSettings > Template/Skill form dialog — "Save" button
8. Add Project dialog (in [slug].tsx)
9. Any future dialogs with a primary action button should follow the same pattern

## Behavior

### Activation

- Mod+Enter triggers the primary action button from anywhere inside the dialog. Registered as a document-level keydown handler, same pattern as the existing Escape handling in ResizableWindow.
- Platform-native modifier: Cmd on macOS, Ctrl on Windows/Linux.

### Disabled state

- When the primary button is disabled (e.g. during submission or when required fields are empty), Mod+Enter is silently ignored.

### Stacked dialogs

- When multiple dialogs are stacked (e.g. TicketDetailDialog with a nested DiscardConfirmation), only the topmost dialog responds to Mod+Enter. The topmost handler consumes the event via preventDefault, preventing it from reaching dialogs underneath. Same pattern as the existing Escape handling.

### Editor interaction

- CodeMirror does not bind Ctrl+Enter or Cmd+Enter, so there is no conflict with the markdown editor. The event bubbles up to the parent dialog naturally. Since TicketDetailDialog itself has no primary action button, Mod+Enter does nothing when only the detail dialog is open. When a nested sub-dialog is open on top, that dialog's handler catches it.

## Visual hint

- Primary action buttons show a tooltip on hover displaying the shortcut: "Cmd+Enter" on macOS, "Ctrl+Enter" on Windows/Linux.

## Out of scope

- Global board-level keyboard shortcuts (e.g. N to create ticket)
- Underlined-letter mnemonics on buttons
- Focus trapping or tab-order changes
- Changes to existing Escape behavior
