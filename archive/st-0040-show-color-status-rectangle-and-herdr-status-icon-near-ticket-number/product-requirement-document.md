# ST-0040 Show color Status Swatch and Herdr status icon near ticket number

## Problem Statement

In the Forest View a ticket card shows only the Ticket Number and title, so the stage a ticket is at is invisible; the user has to open each ticket or switch to the kanban board to see its status. Separately, when agents run as Herdr Agents, there is no way to see from the board or forest whether a ticket's agent is working, waiting for input, or idle without switching to Herdr itself.

## Solution

Each Column in a Board Definition can be given an optional Column Color from a preset palette, edited in the same Settings dialog where columns are managed. Every ticket card (kanban and Forest View) renders a small Status Swatch after the Ticket Number in the color of the Column matching the ticket's status, so the stage is visible at a glance. Next to it, an icon shows the ticket's Herdr Agent Status (working, blocked, idle, unknown), refreshed automatically, so agent activity is visible without leaving the board.

## Requirements

1. A Column in a Board Definition can be assigned an optional Column Color chosen from a fixed preset palette in the Settings column form (add and edit) - because a curated palette guarantees readable contrast in both light and dark themes and keeps the UI to one row of swatches.
2. The palette offers exactly these 12 colors plus a "none" option, "none" being the default: gray #6e7781, blue #0969da, green #1a7f37, yellow #bf8700, orange #bc4c00, red #cf222e, purple #8250df, pink #bf3989, teal #1b7c83, cyan #0598bc, lime #4d8400, brown #9a6700 - because free-form color input invites unreadable choices and adds a picker dependency.
3. A Column Color survives column rename and reorder and is stored with its Column in the Board Definition - because the color is part of the board layout shared by every project using that board.
4. A Status Swatch (small colored rectangle) renders immediately after the Ticket Number on kanban ticket cards and on Forest View cards, including group cards - because Forest View otherwise gives no status cue, and kanban gains a consistent visual language.
5. The Status Swatch shows the Column Color of the Column whose Column Slug matches the ticket's status - because status-to-column matching is the existing contract between tickets and boards.
6. When the matching Column has no Column Color, no swatch is rendered - because an unassigned color means the user chose not to color that stage; inventing a default would be a silent fallback.
7. When the ticket's status matches no Column in the active Board Definition, the swatch renders in the destructive red used by the Undefined Column - because orphaned statuses must stay visible in Forest View just as they are on the board.
8. Hovering the Status Swatch shows the status name in a tooltip - because color alone is ambiguous, especially across boards.
9. A Herdr Agent Status icon renders after the Status Swatch on both card types when the ticket has a Herdr Agent: working as a spinning loader-circle in the primary color, blocked as a circle-alert in amber, idle as a circle-pause in muted gray, unknown as a circle-question-mark in muted gray - because the same circular silhouette keeps the row calm while color and motion make blocked agents (the state the user most needs to notice) stand out.
10. Hovering the icon shows the raw Herdr agent status in a tooltip - because the icon encoding should be discoverable.
11. When a ticket has no Herdr Agent, no icon is rendered - because absence of an agent is the normal state and needs no decoration.
12. Herdr Agent Statuses refresh every 5 seconds while a project page is open, and polling runs only when at least one Coding Agent Profile uses the Herdr Launch Target - because the feature must be inert (no process spawns) for users who do not use Herdr.
13. When querying Herdr fails (CLI not installed, command error), no icons are shown, the failure is logged as an error, and the board keeps working; polling continues so status recovers when Herdr returns - explicit user decision: no error indicator in the UI for this.
14. The icons are display-only with no click behavior - because focusing or controlling agents from the card is a separate feature.

## Implementation Decisions

- The Column definition gains an optional color field holding the palette hex string. Column add and update operations accept it. The change to the Board Definitions file is additive; existing files stay valid with no migration.
- A pure accessor derives the swatch color from a ticket status and the column list (including the undefined-status red case). One shared swatch component is used by the kanban ticket card and the Forest View card.
- Forest View node data is extended to carry the ticket status, which it currently does not.
- A new Herdr core module is the app-side Herdr client (none exists today; only the launch script talks to Herdr). It spawns "herdr agent list", parses the JSON output, and matches agents to tickets by the existing naming contract: agent name equals projectSlug, two hyphens, ticket folder name - the same convention the Herdr launch script uses. It returns a map from ticket folder name to agent status.
- Herdr agent statuses are the CLI's own vocabulary: idle, working, blocked, unknown.
- The statuses are exposed through a query server function colocated in an api file per the data-access rules, consumed with createAsync, and re-fetched on a 5 second interval on the client. This query returns a discriminated availability result instead of throwing, and logs errors server-side (requirement 13).
- Icons are inlined Lucide-style SVGs, matching the codebase convention; no icon dependency is added.

## Testing Decisions

- Good tests here assert external behavior: what a card renders given a board and statuses, what the config file contains after editing - never internal wiring.
- Unit tests: the status-to-color accessor; the Herdr core module's JSON parsing and name matching, with process spawning injected so no real CLI runs.
- Render tests, following the existing kanban render test pattern: swatch shown with the column color, hidden when the column has no color, red for an orphaned status; one icon per each of the four agent statuses.
- e2e, on the real-server harness: assign a Column Color in Settings, assert the Board Definitions file contains it and the swatch is visible on the kanban card and the Forest View card.
- No e2e for Herdr icons: faking the herdr CLI on PATH means spawning console-host processes, which is shell-test territory. The seam is covered by unit tests. Any test spawning the real CLI must be a shell test and runs only on explicit request.

## Out of Scope

- Status Swatch or agent icon in the Ticket Detail Dialog.
- Clicking the icon to focus, attach to, or control the Herdr Agent.
- Agent status for Direct Terminal launches (marker-file based); this feature covers Herdr Agents only.
- Free-form or custom color input for columns.
- Push or subscription-based status updates; the Herdr CLI offers none, so polling is the mechanism.

## Further Notes

- The status vocabulary (idle, working, blocked, unknown) comes from the Herdr CLI itself ("herdr agent wait --status" enumerates it), so no mapping layer is needed.
- CONTEXT.md has been updated with the new glossary terms: Column Color, Status Swatch, Herdr Agent Status.
