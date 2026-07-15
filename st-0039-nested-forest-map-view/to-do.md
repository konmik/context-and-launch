
## Tree view toggle

Add a toggle button at the top, and when it is pressed (save the state between restarts) it shows the selected project in a tree view. it should be an icon button with a tree on it, similar to other existing icon buttons.

Dont forget light/dark modes.

### Main view

Add a button to the top-left to rearrange the tree.

I want a forest map view for tickets instead of panel layout. Tickets that are not depending on anything are at the bottom, then tickets that are depending on others are higher, creating a forest-like representation.

At the start the view is focused on the bottom row, and when the user moves around (by dragging empty space) the app would save the position of the bottom middle point and restore it when reopening forest view of the project.

#### Ticket card

Tickets can be selected by mouse rectangle, opened by clicking, dragged by dragging. 
When more than one ticket is selected, allow grouping them with a button.

Each ticket in the forest is represented by a rectangle with semi-transparent background. The ticket can be dragged around. Basically the ticket should show ticket number, title.

If a ticket depends on several tickets, it must be above them all.

#### Group ticket card

Each group is a separate ticket (similar to how epics are in jira) with its own id and title, it can participate in dependency graph. When tickets are shown inside a group, hide them from dependency graph and only show the group. 

Clicking on a goup would enlarge (add an animation) the group recrangle to open tree view of ticket dependency map inside. Let it take 90% of tree view space. Add close button to the right top corner to close group tree view.

Groups can be nested, i.e. it is possible to group tickets inside a group.

Group card overflow button (three dots button) would allow to ungroup tickets inside, or open the group ticket. Normal clicking would expant the group to a sub-forest view.

#### Dependency line

Draw lines behind tickets to represent dependencies. Line connects at the top means the ticket is depended on, if the line is connected to the bottom then it means the line points to the ticket dependency. Use smooth lines, bezier or something.
 
Clicking on a line or close to it (pick 32px width area) would open the popup menu to delet the dependency.
