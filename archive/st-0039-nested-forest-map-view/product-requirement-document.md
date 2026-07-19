# ST-0039 Nested forest map view

## Summary

Add a Forest View: an alternative to the kanban board that renders a project's tickets as a dependency forest on a pannable, zoomable surface. Tickets are cards connected by dependency lines. Tickets can be dragged, selected by rectangle, and grouped into nestable Groups. The kanban board itself is unchanged.

Domain terms (Dependency, Group, Forest View, Forest Layout, Forest Viewport) are defined in CONTEXT.md.

## Data model

### Ticket fields (status.json)

- dependsOn: optional list of ticket numbers this ticket depends on.
- memberOf: optional ticket number of the Group that contains this ticket.
- All references between tickets use ticket numbers. No separate graph or membership file.

### Integrity rules

- The dependency graph is acyclic. Creating a dependency that would close a cycle is rejected with a visible error.
- Group nesting is acyclic. A group cannot become a member of itself or of any of its own members, directly or transitively. Rejected with a visible error.
- Editing a ticket number rewrites all inbound dependsOn and memberOf entries across the worktree.
- Deleting a ticket removes all inbound dependsOn and memberOf entries across the worktree.
- Archiving a ticket leaves dependsOn and memberOf data of other tickets untouched.
- Rendering ignores references to ticket numbers not present among non-archived tickets. A dependency edge to an absent ticket is not drawn. A ticket whose memberOf target is absent renders as ungrouped. Unarchiving a group therefore restores its grouping without data migration.

### Forest layout file

- forest-layout.json at the worktree root, next to ticket-order.json, versioned on the orphan branch like other ticket data.
- Maps ticket number to an x/y position.
- Positions are relative to the containing group's inner space. Top-level tickets are relative to the root forest origin, so dragging a group does not touch member positions.
- Tickets with no entry are placed by automatic layout.

### Local UI state (localStorage, per machine, keyed by projectSlug)

- View mode: kanban or forest. The project page opens in the saved mode.
- Forest Viewport: the bottom-middle point of the visible area plus the zoom scale.

## View toggle

- An icon button with a tree icon in the project page header, next to the existing icon buttons, using the existing icon button styling.
- Pressing it switches the main area between the kanban board and the Forest View.
- The choice persists between restarts, per project.
- Works in light and dark mode.

## Forest View surface

- Fills the area the kanban board occupies.
- Shows all non-archived tickets of the project regardless of status, including statuses that match no board column.
- Pan: left-drag on empty space.
- Zoom: mouse wheel, zooming toward the cursor. No modifier keys.
- Selection: Shift plus left-drag on empty space draws a selection rectangle. Tickets intersecting the rectangle become selected.
- First open (no saved viewport): the view is focused on the bottom row, horizontally centered.
- Pan and zoom changes save the Forest Viewport; reopening the forest view of the project restores it.
- A Rearrange button sits at the top-left of the surface. It recomputes automatic layout for the currently visible forest (the root forest, or the open sub-forest) and overwrites the saved positions of the tickets in it.

## Layout

- Tickets that depend on nothing sit on the bottom row.
- A ticket that depends on other tickets is placed above all of them. If it depends on several, it is above every one of them.
- These placement rules apply to automatic layout only. Manual dragging is unconstrained.
- A collapsed group is laid out as a single node. Its layer derives from the union of its members' dependencies on tickets outside the group, and of outside tickets' dependencies on its members.
- Automatic layout places only tickets without a saved position. Dragging a card saves its position. Rearrange overwrites saved positions.

## Ticket card

- A rectangle with a semi-transparent background showing the ticket number and title.
- Click opens the Ticket Detail Dialog.
- Dragging moves the card and persists its position.
- Dragging a card that belongs to the current selection moves all selected cards together.
- Readable in light and dark mode.

## Selection and grouping

- When two or more tickets are selected, a floating Group button appears at the edge of the selection bounding box.
- The Group button opens the new-ticket dialog: ticket number auto-suggested as usual, title required. Confirming creates the group ticket and sets memberOf on every selected ticket to its number.
- Grouping performed inside an open sub-forest sets the new group's own memberOf to the enclosing group, so the new group appears where the selection was.

## Group card

- Rendered like a ticket card (number, title) but visually distinguishable as a group.
- Members are hidden from the surrounding map. Dependency edges from or to hidden members re-route to the group card.
- Click enlarges the group card with an animation into a sub-forest view covering 90 percent of the Forest View, with a close button in the top-right corner.
- The sub-forest supports the same interactions: pan, zoom, drag, rectangle selection, grouping, dependency creation and deletion, and its own Rearrange scope.
- Inside the sub-forest, edges between members are drawn normally. Edges to or from tickets outside the group are drawn as lines running off the sub-forest map: downward when a member depends on an outside ticket, upward when an outside ticket depends on a member.
- Groups nest. Clicking a nested group card opens its sub-forest the same way.
- Overflow menu (three dots button) on the group card:
  - Ungroup: direct members' memberOf is reassigned to the group's own parent group, or cleared when the group is top-level. Nested groups among the members keep their internal structure. The group ticket itself survives as an ordinary ticket with its number, status, and dependencies.
  - Open group ticket: opens the Ticket Detail Dialog for the group ticket.

## Dependency lines

- Smooth bezier curves drawn behind ticket cards.
- An edge runs from the top edge of the depended-on ticket to the bottom edge of the dependent ticket. A line touching a card's top means something depends on it; a line touching its bottom points at its dependency.
- Creating: hovering a card reveals connector handles at its top and bottom edges. Dragging from a handle onto another card creates the dependency: from the top handle of B onto A, or from the bottom handle of A onto B, both create "A depends on B". While dragging, a live line follows the pointer. Releasing over empty space cancels. An edge that would create a cycle is rejected with a visible error.
- Deleting: clicking a line, anywhere within a 32px-wide zone around it, opens a popup menu with an action to delete the dependency.

## Kanban board behavior

- The board stays group-unaware. A group ticket appears as an ordinary card in the column matching its status; member tickets appear as ordinary cards in their own columns. Grouping affects only the Forest View.

## Out of scope

- Status display on forest cards.
- Dependency editing from the Ticket Detail Dialog.
- Aggregating a group's status from its members.
