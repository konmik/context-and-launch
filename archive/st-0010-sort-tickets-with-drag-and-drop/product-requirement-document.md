# ST-0010: Sort Tickets with Drag and Drop

## Problem

Tickets on the kanban board are sorted alphabetically by ticket number. Users have no way to control the order of tickets within a column. Moving tickets between columns requires the three-dot menu, which is indirect and offers no positional control.

## Solution

Replace the current drag-to-column-header behavior and the "Move to..." menu option with a unified drag-and-drop interaction. Dropping a ticket at a specific position in any column (same or different) sets both its column and its position. A new `ticket-order.json` file persists the order.

## Requirements

### Drag-and-Drop Interaction

- The entire ticket card is the drag handle (no separate grip icon).
- Dropping a ticket between two tickets in the same column reorders it.
- Dropping a ticket into a different column moves it there and sets its position.
- This is the only way to move tickets between columns. The "Move to..." submenu in the ticket card three-dot menu is removed. The menu retains Edit and Delete.

### Visual Feedback

- Drag overlay: a translucent copy of the card follows the cursor, slightly scaled down and rotated.
- Drop indicator: a visible gap or horizontal line appears between tickets at the insertion point.
- Source card: the original card dims/fades in place while being dragged, so the user sees where it came from.
- Empty columns: show a placeholder drop zone (e.g. dashed border area or highlighted column body) when the user is dragging a ticket.

### Persistence: ticket-order.json

- Location: worktree root (`~/.ai-stages/tickets/{slug}/ticket-order.json`), alongside ticket folders.
- Format: a JSON object mapping column names to ordered arrays of ticket folder names.

```json
{
  "todo": ["st-0003-some-ticket", "st-0001-other-ticket"],
  "in-progress": ["st-0005-another-ticket"],
  "review": [],
  "done": ["st-0002-old-ticket"]
}
```

- Source of truth for status: `status.json` inside each ticket folder. If `ticket-order.json` says a ticket is in "todo" but its `status.json` says "in-progress", the ticket renders in the column its `status.json` says, appended at the end. The stale entry in `ticket-order.json` is cleaned up on the next reorder or write.
- Tickets not listed in `ticket-order.json` (newly created tickets, or tickets created externally) appear at the bottom of their column.
- Every write to `ticket-order.json` is committed to the orphan branch, consistent with all other ticket state changes.

### Lifecycle Consistency

- Ticket creation: the new ticket's folder name is appended to the end of its column's array in `ticket-order.json`.
- Ticket deletion: the entry is removed from `ticket-order.json` as part of the delete operation.
- Ticket rename (number or title change that changes the folder name): the old folder name is replaced with the new one in `ticket-order.json`.
- Cross-column move via drag: the folder name is removed from the source column's array and inserted at the target position in the target column's array. The ticket's `status.json` is also updated.

### Library

- Use `@thisbeyond/solid-dnd` for drag-and-drop. It provides sortable lists, cross-container moves, drag overlays, and accessibility support for Solid.js.

## Out of Scope

- Per-project board config (column definitions remain global in `~/.ai-stages/board-config/kanban.json`).
- Keyboard-based reordering.
- Multi-select drag.
