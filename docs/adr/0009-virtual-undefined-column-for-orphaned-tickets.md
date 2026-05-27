# Orphaned tickets render in a virtual "undefined" column instead of disappearing

When a ticket's status does not match any column in the active board (because the column was deleted, or the project's board was deleted entirely), the ticket appears in a virtual "undefined" column at the far right of the board. This column has red frame and red title styling, is not part of the Board Definition, and only renders when orphaned tickets exist. Each ticket card in this column shows its actual orphaned status value in red. Users can drag tickets out into any real column.

## Considered Options

- Hide orphaned tickets entirely. Rejected: tickets would silently vanish from the board with no way to find them short of inspecting the filesystem. Data loss by omission.
- Auto-assign orphaned tickets to the first column. Rejected: this silently changes ticket state, which is destructive if the user deletes a column by mistake. It also conflates "new work" with "displaced work" in the first column.
- Fall back to a different board when a project's board is deleted. Rejected: silent fallback hides the problem. The user should see that their board is gone and their tickets need reassignment.
