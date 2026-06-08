# ST-0010 Implementation Plan: Sort Tickets with Drag and Drop

## Overview

Replace native HTML5 drag-and-drop in KanbanBoard.tsx (column-only moves) and "Move to..." submenu in TicketCard.tsx with unified drag-and-drop using @thisbeyond/solid-dnd. Add ticket-order.json persistence layer.

## Step 1: Install @thisbeyond/solid-dnd

npm install @thisbeyond/solid-dnd

If no types ship, create src/solid-dnd.d.ts with declare module.

Acceptance: import compiles, tsc passes.

## Step 2: Create src/server/ticket-order.ts

New TicketOrderStore class. File: {worktreeDir}/ticket-order.json

API:
- read(): TicketOrder -- returns {} if missing/malformed
- write(order): persist + auto-commit
- reconcile(tickets, columns): clean order from actual state
- moveTicket(folderName, fromColumn, toColumn, newIndex)
- appendTicket(folderName, column)
- removeTicket(folderName)
- renameTicket(oldFolderName, newFolderName)

Type: TicketOrder = Record<string, string[]>

Reconcile logic:
- Each ticket appears in column matching its status.json
- Tickets in order file matching status keep position
- Tickets not in order file appended at end
- Stale/deleted entries removed
- Empty columns get empty array

## Step 3: Integrate TicketOrderStore into ticket-store.ts lifecycle

- createTicket: call orderStore.appendTicket(folderName, status)
- deleteTicket: call orderStore.removeTicket(folderName)
- updateTicket with rename: call orderStore.renameTicket(old, new)
- Status-only change via updateTicket does NOT modify order (reconcile handles it on load)

## Step 4: Update loadBoard to include ordered tickets

In actions.ts loadBoard:
- Create TicketOrderStore, call reconcile(tickets, columns)
- Return ticketOrder in BoardState

In types.ts:
- Add TicketOrder type
- Add ticketOrder to BoardState

In KanbanBoard ticketsForColumn:
- Use ticketOrder to sort instead of alphabetical

## Step 5: Add reorderTicketAction server action

New action in actions.ts:
- reorderTicketAction(slug, folderName, fromColumn, toColumn, newIndex)
- If cross-column: update status.json via TicketStore.updateTicket
- Update ticket-order.json via TicketOrderStore.moveTicket

## Step 6: Rewrite KanbanBoard.tsx with @thisbeyond/solid-dnd

Structure:
- DragDropProvider + DragDropSensors at top
- closestCenter collision detection
- Each column: createDroppable for empty column drop target
- Each ticket: createSortable (draggable + droppable)
- SortableProvider per column with ordered IDs
- DragOverlay with translucent, rotated card copy

Sortable IDs: "{column}:{folderName}"

Visual feedback:
- Drag overlay: opacity-80 scale-95 rotate-2 shadow-xl
- Source card: opacity-30 while dragging
- Empty columns: dashed border placeholder

Replace onMoveTo prop with onReorder(folderName, fromColumn, toColumn, newIndex).

## Step 7: Update TicketCard.tsx

Remove "Move to..." submenu and columns/onMoveTo props.
Menu retains Edit and Delete only.

## Step 8: Wire up [slug].tsx route

- Remove handleMoveTo
- Add handleReorder calling reorderTicketAction + revalidate
- Pass onReorder to KanbanBoard

## Step 9: Create src/server/ticket-order.test.ts

Tests:
1. read on missing file returns {}
2. read on malformed JSON returns {}
3. write persists and auto-commits
4. reconcile with empty order builds from tickets
5. reconcile preserves existing order
6. reconcile appends unknown tickets at end
7. reconcile removes deleted tickets
8. reconcile moves ticket when status.json disagrees
9. reconcile ensures all columns have entries
10. moveTicket same-column reorder
11. moveTicket cross-column
12. appendTicket adds to end
13. removeTicket removes from all columns
14. renameTicket replaces folder name
15. appendTicket creates file when missing

## Step 10: Integration tests for lifecycle hooks

In ticket-order.test.ts or ticket-store.test.ts:
1. createTicket appends to ticket-order.json
2. deleteTicket removes from ticket-order.json
3. updateTicket with rename updates ticket-order.json
4. updateTicket with status-only does NOT modify ticket-order.json

## Dependency Graph

Step 1 -> Step 2 -> Step 3
Step 2 -> Step 4 -> Step 5
Step 4 -> Step 6 -> Step 7 -> Step 8
Step 2 -> Step 9, Step 10
All -> Step 12 (validation)

## Edge Cases

- ticket-order.json does not exist (fresh project)
- Ticket exists on disk but not in order file
- Ticket in order file with wrong column
- Ticket in order file but deleted from disk
- Click vs drag on TicketCard (menu button must not initiate drag)
- SSR: wrap DragDropProvider in clientOnly if needed
- Two commits per cross-column move (status.json + ticket-order.json)
