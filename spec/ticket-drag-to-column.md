# Ticket Drag to Column

- User drags a ticket card
- Show floating overlay following the cursor, fade original in place
- As the cursor moves, find the target column and insertion index
  - Cross-column: show ghost preview at insertion point
  - Same-column: shift cards via transforms, no ghost preview
- Drop resolves to no-op if no target, target is "undefined", or same position
- Apply optimistic order update on the client
- POST reorder to server
  - Cross-column move: update ticket status to destination column
  - Update order file and persist
- Revalidate board data, which clears the optimistic override
