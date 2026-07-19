# ST-0039 Nested Forest Map View — Detailed Plan

Design authority: product-requirement-document.md in this ticket folder. The PRD body (Data model,
Integrity rules, Forest layout file, Local UI state, View toggle, Forest View surface, Layout,
Ticket card, Selection and grouping, Group card, Dependency lines, Kanban board behavior, Out of
scope) is the set of implementation decisions this plan realizes. Domain terms (Dependency, Group,
Forest View, Forest Layout, Forest Viewport) are already defined in CONTEXT.md; no glossary work is
needed.

Repo root for all paths below:
`C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0039-nested-forest-map-view`

Read CLAUDE.md at the repo root before starting; its rules apply to every step (no comments, exact
dep pins, no z-index, `undefined` over `null`, no bare "slug", server functions in `*-api.ts`
colocated under `src/components/`, mutations return typed results and never throw, reads throw).

## Architecture summary (target state)

- `status.json` gains two optional fields: `dependsOn?: string[]` (Ticket Numbers) and
  `memberOf?: string` (Ticket Number of the containing Group). Types in
  `src/core/ticket/ticket-repository.ts` (StatusJson) and surfaced on TicketInfo in
  `src/core/ticket/ticket-store.ts`.
- Graph integrity (acyclic dependencies, acyclic nesting, inbound rewrite on number edit, inbound
  removal on delete) is enforced in core: a pure module `src/core/ticket/ticket-relations.ts` plus
  TicketStore methods that apply it across the worktree (including `archive/`).
- `forest-layout.json` at the worktree root is owned by a new
  `src/core/ticket/forest-layout-store.ts` (peer of TicketOrderStore), shape:
  `Record<TicketNumber, { x: number; y: number }>`. Positions are in the containing group's inner
  space; top-level positions are relative to the root forest origin.
- Server surface: new `src/components/forest/forest-api.ts` with one query (`getForestLayout`) and
  mutations (`saveForestPositions`, `addDependency`, `removeDependency`, `createGroupTicket`,
  `ungroupTicket`). Ticket data itself keeps flowing through the existing `project-page` query;
  TicketInfo just carries the two new fields.
- Client: new feature directory `src/components/forest/` containing pure modules
  (`forest-graph.ts` for scope/edges/layers/auto-layout, `forest-geometry.ts` for
  viewport/selection/bezier math, `forest-local-state.ts` for localStorage persistence), a thin
  controller (`forest-view-state.ts`), and components (`ForestView.tsx`, `ForestSurface.tsx`,
  `ForestCard.tsx`). Pan/zoom/drag/selection are hand-rolled pointer-event handling on a
  CSS-transformed surface; edges are SVG bezier paths behind the cards. No new npm dependency.
- The project route (`src/routes/project/[projectSlug].tsx`) gains a tree-icon toggle button in the
  header and switches the main area between KanbanBoard and ForestView based on a per-project view
  mode persisted in localStorage. The kanban board code path is untouched and group-unaware.

## Coordinate system and constants (used throughout, define once in forest code)

- World units equal CSS pixels at zoom scale 1. x grows right, y grows down. The bottom row of the
  forest sits at larger y; a ticket at depth d is placed at `y = -d * ROW_GAP`.
- Constants (export from `forest-graph.ts`): `CARD_WIDTH = 208`, `CARD_HEIGHT = 72`,
  `ROW_GAP = 160`, `H_GAP = 248`. A card's saved position is its top-left corner in world space.
- Surface rendering: an outer clipping div (fills the main area) contains an inner "world" div with
  `transform: translate(tx, ty) scale(s)`, `transform-origin: 0 0`. Screen-to-world:
  `wx = (sx - tx) / s`, `wy = (sy - ty) / s`.
- Forest Viewport persistence: the world coordinates of the bottom-middle point of the visible
  area, plus the scale: `{ x, y, scale }`. Restore with `tx = width/2 - x*scale`,
  `ty = height - y*scale`.
- localStorage keys (per machine, per project): `view-mode:{projectSlug}` with values
  `"kanban" | "forest"`, and `forest-viewport:{projectSlug}` with the JSON above. Follow the
  guarded-storage pattern of `src/components/shared/theme-toggle-pure.ts` (storage passed as a
  parameter, try/catch around access with a comment-free guard — return defaults on failure).

## Resistance log (where the codebase resists the PRD design, and the resolution)

R1. TicketStore.updateTicket rebuilds status.json from an explicit field whitelist
(`{ number, title, status, useWorktree, createdAt, references, agentWorktree* }`), so any new
status.json field would be silently dropped on every edit — corrupting `dependsOn`/`memberOf`.
Resolution: refactor to a spread-based merge (`{ ...current, ...changes }`) so unedited fields
survive by construction (Step 2, behavior-preserving seam). Do not patch by adding the two new
fields to the whitelist; that repeats the trap for the next field.

R2. TicketRepository has bespoke read/write pairs per worktree-root JSON file (`readOrderJson`,
`writeOrderJson`). Adding forest-layout.json the same way would be a third copy of the same
warn-and-null read logic. Resolution: generalize to `readWorktreeJson(worktreeDir, fileName)` /
`writeWorktreeJson(worktreeDir, fileName, data)` and reimplement the order accessors on top
(Step 1, behavior-preserving seam). ForestLayoutStore then uses the generic accessor.

R3. All TicketStore mutations are single-folder operations; the PRD's integrity rules (number edit
rewrites inbound references across the worktree, delete removes them, including under `archive/`)
need a cross-worktree status rewrite mechanism that does not exist. Resolution: add a private
ticket-directory iterator on TicketStore covering the worktree root and `archive/`, refactor
`listAllTicketNumbers` onto it as the seam proof (Step 3), then build the cascades on it (Step 8).
Cycle detection and reference-rewrite computation live in the pure module `ticket-relations.ts`
(Step 6) so they are testable without a filesystem.

R4. References between tickets use Ticket Numbers (PRD), but TicketStore is keyed by folderName and
has no number-to-ticket lookup; forest-layout.json is also number-keyed, so a number edit would
orphan a saved position. Resolution: mutations that take a number resolve it via `listTickets()`;
the number-edit cascade also renames the forest-layout key, and delete removes it (Steps 7 and 8).

R5. The project route hard-renders KanbanBoard as the only loaded-state main view; there is no seam
for an alternative main-area view. Resolution: introduce a view-mode concept (pure persistence
module + signal in the route) and branch the loaded Match between KanbanBoard and ForestView
(Steps 12 and 16). KanbanBoard props and internals stay untouched.

R6. The first-column-status rule for new tickets (`boardConfigManager.getConfig(boardId).columns[0]`
with a "Board has no columns configured" error) lives inline in `createTicket` in
`src/components/ticket/ticket-api.ts`. Group creation needs the same rule, and duplicating it in
forest-api violates the no-duplication rule. Resolution: extract
`src/core/board/initial-ticket-status.ts` with DI-style deps (same pattern as
`column-rename-migration.ts`) and use it from both server functions (Step 4, behavior-preserving
seam).

R7. Group creation must be atomic (create the group ticket, set memberOf on every member, set the
group's own memberOf inside a sub-forest, validate nesting acyclicity) — composing existing
single-purpose server calls from the client cannot give that. Resolution: a
`TicketStore.createGroup` method performs the whole operation server-side (Step 8) behind one
server function (Step 9).

R8. The kanban TicketCard is column-DnD-flavored (menu, `data-drag-source`, solid-dnd assumptions)
and solid-dnd itself is a sortable-list library, unusable for free positioning on a scaled surface.
Resolution: deliberate non-reuse — a separate ForestCard component and hand-rolled pointer-event
interaction on the transformed surface, with all geometry in pure modules (Steps 11, 13, 14). The
kanban board stays group-unaware per the PRD.

R9. Ungrouping changes the coordinate space of member positions (they are stored relative to the
group's inner space, PRD), which the PRD does not spell out. Resolution rule, implemented in
`TicketStore.ungroup`: if both the group and a direct member have saved positions, rewrite the
member position to `groupPos + memberPos` (its parent-space equivalent); otherwise delete the
member's saved entry so automatic layout places it. Deterministic and test-covered (Step 8).

## Part 1 — Seams (behavior-preserving; run `npm run test` after each)

### Step 1: Generalize worktree-root JSON access in TicketRepository

Files: `src/core/ticket/ticket-repository.ts`.

Change: add two methods:

- `readWorktreeJson(worktreeDir: string, fileName: string): unknown | null` — joins the path, reads
  via `this.configRepo.readJson`, catches, `console.warn`s with the file path, returns null on
  failure (exact behavior of the current `readOrderJson`).
- `writeWorktreeJson(worktreeDir: string, fileName: string, data: unknown): void`.

Reimplement `readOrderJson`/`writeOrderJson` as one-line delegations passing
`'ticket-order.json'`. Keep their signatures so TicketOrderStore is untouched.

Why: resistance R2; forest-layout.json needs the same read/write semantics without a third copy.

Acceptance: `npm run test` passes with no test changes; `readOrderJson` behavior on malformed JSON
(warn + null) is unchanged (covered by existing ticket-order tests).

### Step 2: Spread-based status update in TicketStore.updateTicket

Files: `src/core/ticket/ticket-store.ts`, `src/core/ticket/ticket-store.test.ts`.

Change: in `updateTicket`, replace the explicitly-listed `updated: StatusJson` object with
`const updated: StatusJson = { ...current, number: updatedNumber, title: updatedTitle, status: updatedStatus };`.
Everything else (rename logic, order-store rename) stays as is.

Add a unit test: write a status.json containing an extra optional field (use `references`, an
existing optional field, plus after Step 5 extend the same test to `dependsOn`/`memberOf`), call
`updateTicket` changing only the title, and assert the field survives on disk.

Why: resistance R1; without this, every ticket edit erases dependency and membership data.

Acceptance: new test passes; all existing ticket-store tests pass.

### Step 3: Cross-worktree ticket directory iterator in TicketStore

Files: `src/core/ticket/ticket-store.ts`.

Change: add a private method
`private ticketDirs(includeArchive: boolean): string[]` returning absolute directories of every
ticket folder in the worktree root (skipping dot-dirs and `archive`), plus the folders directly
under `archive/` when `includeArchive` is true. Refactor `listAllTicketNumbers` to use it (it
currently duplicates the two-directory scan inline). `listTickets` may also use it for the
non-archive case.

Why: resistance R3; the integrity cascades in Step 8 need one authoritative way to enumerate every
status.json in the worktree, and refactoring an existing consumer proves the seam without behavior
change.

Acceptance: `npm run test` passes with no test changes (listAllTicketNumbers behavior covered by
ticket-number/store tests).

### Step 4: Extract initial ticket status resolution

Files: create `src/core/board/initial-ticket-status.ts`; modify
`src/components/ticket/ticket-api.ts`.

Change: new module exporting

```
resolveInitialTicketStatus(
  projectSlug: string,
  deps: {
    projectRegistry: Pick<ProjectRegistry, 'getBoardId'>;
    boardConfigManager: Pick<BoardConfigManager, 'getConfig'>;
  },
): string
```

It resolves boardId, reads columns, throws `ValidationError('Board has no columns configured')`
when empty, returns `columns[0].name`. Rewire `createTicket` in ticket-api.ts to call it (the
thrown ValidationError flows through the existing `errorResult(e)` catch, preserving the returned
message).

Why: resistance R6; `createGroupTicket` (Step 9) needs the identical rule.

Acceptance: `npm run test` passes; the create-ticket e2e/unit paths still surface "Board has no
columns configured" for a column-less board (existing coverage).

## Part 2 — Core domain

### Step 5: dependsOn / memberOf on StatusJson and TicketInfo

Files: `src/core/ticket/ticket-repository.ts`, `src/core/ticket/ticket-store.ts`,
`src/core/ticket/ticket-store.test.ts`, `e2e/fixtures.ts`.

Change:

- StatusJson: add `dependsOn?: string[];` and `memberOf?: string;`.
- TicketInfo: add the same two optional fields; `readTicket` maps them through
  (`dependsOn: status.dependsOn`, `memberOf: status.memberOf`).
- e2e/fixtures.ts: extend `SeedTicket` with `dependsOn?: string[]` and `memberOf?: string` and
  spread them into the seeded status.json (only when present, mirroring `createdAt`). Extend
  `StatusJsonShape` with the two optional fields so e2e assertions can read them. Add a helper
  `readForestLayout(server, projectSlug): Record<string, { x: number; y: number }> | null` reading
  `{ticketsPath}/forest-layout.json`.

Why: PRD Data model — ticket fields live in status.json, referenced by Ticket Number, no separate
graph file.

Acceptance: `tsc --noEmit` clean; extend the Step 2 preservation test to seed
`dependsOn: ['X-1']` and `memberOf: 'X-2'` and assert both survive `updateTicket` title-only
edits; `listTickets()` returns the fields.

### Step 6: Pure relations module

Files: create `src/core/ticket/ticket-relations.ts` and `src/core/ticket/ticket-relations.test.ts`.

Content — pure functions over minimal records `{ number: string; dependsOn?: string[]; memberOf?: string }`:

- `wouldCreateDependencyCycle(tickets, dependentNumber, dependencyNumber): boolean` — true when
  dependencyNumber is reachable-from... precisely: adding edge dependent->dependency closes a cycle,
  i.e. dependentNumber is reachable from dependencyNumber via dependsOn edges (ignore references to
  numbers not present in `tickets`). Self-dependency (`dependent === dependency`) counts as a cycle.
- `wouldCreateMembershipCycle(tickets, memberNumbers: string[], groupNumber: string): boolean` —
  simulate setting memberOf=groupNumber on each member, then walk the memberOf chain from
  groupNumber; a cycle exists if the walk revisits a node (guard with a visited set; ignore absent
  references).
- `rewriteInboundReferences(status: StatusJson, oldNumber: string, newNumber: string): StatusJson | undefined`
  — returns a new status with occurrences of oldNumber in `dependsOn` replaced and `memberOf`
  replaced when it equals oldNumber; returns `undefined` when nothing referenced oldNumber.
- `removeInboundReferences(status: StatusJson, removedNumber: string): StatusJson | undefined` —
  removes removedNumber from `dependsOn` (dropping the field when the list becomes empty) and
  deletes `memberOf` when it equals removedNumber; `undefined` when unchanged.

Import the StatusJson type from ticket-repository (functions must not mutate inputs; return new
objects — immutability per CLAUDE.md).

Tests: direct cycle, transitive cycle, self-cycle, no-cycle, absent-reference tolerance for both
cycle checks; rewrite/remove covering dependsOn-only, memberOf-only, both, and unchanged cases.

Why: PRD Integrity rules; keeping graph logic pure makes it testable without git/fs and reusable by
both cascades and mutation validation.

Acceptance: new unit tests pass.

### Step 7: ForestLayoutStore

Files: create `src/core/ticket/forest-layout-store.ts` and
`src/core/ticket/forest-layout-store.test.ts`.

Content: `export type ForestLayout = Record<string, { x: number; y: number }>;` and a class
`ForestLayoutStore` (constructor `(worktreeDir: string, repo?: TicketRepository)`, mirroring
TicketOrderStore) with:

- `read(): ForestLayout` — via `repo.readWorktreeJson(worktreeDir, 'forest-layout.json')`; returns
  `{}` for null/non-object/array or entries whose value is not `{ x: number, y: number }` (validate
  shape; drop invalid entries rather than failing the whole file only if the top level is an
  object — if the top level is malformed return `{}`).
- `savePositions(positions: ForestLayout): void` — read, merge (`{ ...existing, ...positions }`),
  write. Used by card drags, group creation position, and Rearrange (which passes a value for every
  ticket in scope, so merge semantics also implement "overwrite saved positions").
- `renameTicket(oldNumber: string, newNumber: string): void` — move the entry when present.
- `removeTicket(ticketNumber: string): void` — delete the entry when present.

Why: PRD Forest layout file — forest-layout.json next to ticket-order.json, ticket number to x/y;
R4 requires rename/remove hooks.

Acceptance: unit tests (tmp-dir pattern of ticket-store.test.ts or plain tmp dirs without git —
the store touches only one JSON file) cover read of missing/malformed file, merge semantics,
rename, remove.

### Step 8: TicketStore graph mutations and integrity cascades

Files: `src/core/ticket/ticket-store.ts`, `src/core/ticket/ticket-store.test.ts`.

Changes:

- Construct a `ForestLayoutStore` alongside the order store; expose
  `readForestLayoutStore(): ForestLayoutStore` (peer of `readOrderStore`).
- `addDependency(folderName: string, dependencyNumber: string): void` — load the dependent's
  status; load all non-archived tickets; throw `ValidationError` when the dependency target number
  does not exist among non-archived tickets, and
  `ValidationError('Dependency would create a cycle')` when
  `wouldCreateDependencyCycle` says so (self-dependency included). Idempotent: if already listed, do
  nothing. Otherwise append and write (spread-merge on current status).
- `removeDependency(folderName: string, dependencyNumber: string): void` — filter it out; drop the
  `dependsOn` field entirely when the list becomes empty (prefer undefined over empty remnants).
- `createGroup(number: string, title: string, initialStatus: string, memberFolderNames: string[], parentGroupNumber?: string, position?: { x: number; y: number }): TicketInfo`
  — resolve every member folder (throw NotFoundError on a missing one) before writing anything;
  validate nesting acyclicity with `wouldCreateMembershipCycle` over the proposed state (members'
  numbers, new group number, parentGroupNumber chain), throwing
  `ValidationError('Grouping would create a membership cycle')`; then `createTicket(number, title,
  initialStatus)`, set `memberOf` on the group's status to parentGroupNumber when provided, set
  `memberOf` on each member's status to the new group's number, and save `position` for the group
  via the layout store when provided. Return the group TicketInfo.
- `ungroup(folderName: string): void` — read the group status; for every non-archived ticket whose
  `memberOf === group.number`: set `memberOf` to the group's own `memberOf` (or delete the field
  when the group is top-level) and apply the R9 position rule (translate `groupPos + memberPos`
  when both saved, else remove the member's layout entry). The group ticket itself is not modified
  except that it keeps existing (PRD: it survives with number, status, dependencies).
- Number-edit cascade in `updateTicket`: when the number actually changed, after writing the
  ticket's own status, iterate `ticketDirs(true)` (root + archive), skip the edited ticket's dir,
  apply `rewriteInboundReferences(status, oldNumber, newNumber)` and write back only changed ones;
  then `forestLayoutStore.renameTicket(oldNumber, newNumber)`.
- Delete cascade in `deleteTicket`: read the ticket's number before removal, then remove the
  folder, then iterate `ticketDirs(true)` applying `removeInboundReferences`, then
  `forestLayoutStore.removeTicket(number)` and the existing `orderStore.removeTicket`.
- `archiveTicket`: unchanged (add a test asserting other tickets' dependsOn/memberOf and the
  archived ticket's layout entry are untouched — PRD: archive leaves data intact so unarchiving
  restores grouping).

Unit tests (extend ticket-store.test.ts, git-tmp-dir pattern): add/remove dependency round-trip on
disk; cycle rejection (direct, transitive, self); dependency target must exist; createGroup writes
memberOf on all members and the parent memberOf inside a sub-forest; createGroup rolls nothing back
scenario is avoided by validating before writing (assert no group folder exists after a failed
validation); ungroup reassigns to parent and clears at top level, keeps nested groups' internal
memberOf intact, and applies the position rule both ways; number edit rewrites inbound entries in
root and archive and renames the layout key; delete removes inbound entries and the layout key;
archive leaves everything.

Why: PRD Integrity rules and Selection and grouping / Group card semantics belong in core so every
caller (forest API today, anything later) gets them; resistances R3, R4, R7, R9.

Acceptance: all new unit tests pass; `npm run test` clean.

## Part 3 — Server API

### Step 9: forest-api.ts server functions

Files: create `src/components/forest/forest-api.ts`.

Content (follow the ticket-api.ts style exactly — top-level imports of `worktreeManager`,
`projectRegistry`, `boardConfigManager` from `~/core/config/instances.js`, plain-argument server
functions):

- `export const getForestLayout = query(async (projectSlug: string): Promise<ForestLayout> => { "use server"; ... }, "forest-layout");`
  — resolve worktreeDir via `worktreeManager.getWorktreeDir`, return
  `new TicketStore(worktreeDir).readForestLayoutStore().read()`. Reads throw; ErrorBoundary
  catches.
- `saveForestPositions(projectSlug: string, positions: ForestLayout)` — "use server",
  try/`savePositions`/`return { ok: true as const }` catch `errorResult(e)`.
- `addDependency(projectSlug: string, folderName: string, dependencyNumber: string)` — wraps
  `TicketStore.addDependency`; ValidationError from a cycle becomes the typed error result whose
  message the UI shows (PRD: rejected with a visible error).
- `removeDependency(projectSlug: string, folderName: string, dependencyNumber: string)`.
- `createGroupTicket(projectSlug: string, number: string, title: string, memberFolderNames: string[], parentGroupNumber?: string, position?: { x: number; y: number })`
  — resolves initial status via `resolveInitialTicketStatus(projectSlug, { projectRegistry,
  boardConfigManager })`, calls `TicketStore.createGroup`, returns
  `{ ok: true as const, folderName }` or errorResult.
- `ungroupTicket(projectSlug: string, folderName: string)`.

Why: PRD data flows; CLAUDE.md data-access rules (mutations return typed discriminated results,
server functions import from src/core, colocated `*-api.ts` under src/components).

Acceptance: `tsc --noEmit` clean; behavior exercised by the e2e tests of Step 17 (per project
convention, server functions are covered through e2e against the real server, not stubbed).

## Part 4 — Client pure modules

### Step 10: forest-graph.ts (scope, effective edges, layers, auto layout)

Files: create `src/components/forest/forest-graph.ts` and
`src/components/forest/forest-graph.test.ts`.

Input type: `ForestTicket = Pick<TicketInfo, 'number' | 'title' | 'folderName' | 'dependsOn' | 'memberOf'>`.
All functions treat references to numbers absent from the input list as nonexistent (PRD: rendering
ignores absent references).

Exports:

- Constants `CARD_WIDTH`, `CARD_HEIGHT`, `ROW_GAP`, `H_GAP` (values from the header section).
- `effectiveParent(tickets, ticket): string | undefined` — `memberOf` when it names an existing
  ticket in the list, else undefined (renders ungrouped per PRD).
- `resolveScope(tickets, scopeGroupNumber: string | undefined): ForestTicket[]` — tickets whose
  effectiveParent equals the scope (undefined = root forest).
- `isGroup(tickets, ticketNumber): boolean` — true when at least one ticket's effectiveParent is
  this number (a group whose members are all archived renders as an ordinary ticket; unarchiving
  restores grouping, per PRD).
- `representativeInScope(tickets, ticketNumber, scopeGroupNumber): string | undefined` — climb the
  effectiveParent chain from the ticket until reaching a node whose effectiveParent is the scope;
  return that node's number, or undefined when the ticket is not inside the scope's subtree
  (visited-set guarded).
- `internalEdges(tickets, scopeGroupNumber): { fromNumber: string; toNumber: string }[]` — for
  every dependency pair (dependent `fromNumber` depends on `toNumber`), map both endpoints through
  representativeInScope; keep edges where both map and differ; dedupe. This implements PRD "edges
  from or to hidden members re-route to the group card" and the collapsed-group layer derivation
  (the group node inherits the union of member edges automatically).
- `externalEdges(tickets, scopeGroupNumber): { memberNumber: string; direction: 'down' | 'up' }[]`
  — dependency pairs where exactly one endpoint maps into the scope: `down` when the in-scope
  member is the dependent (member depends on an outside ticket), `up` when an outside ticket
  depends on the member. Only meaningful for sub-forests; empty for root.
- `computeDepths(nodeNumbers, edges): Map<string, number>` — depth 0 for nodes with no outgoing
  dependency edges within the scope; otherwise `1 + max(depth of dependencies)`; defensive visited
  guard against malformed cycles (cap at nodes.length).
- `autoLayoutPositions(nodes, edges, savedPositions: ForestLayout): ForestLayout` — returns
  positions only for nodes without a saved entry. `y = -depth * ROW_GAP`. x placement per row,
  bottom row first: candidate x is the mean x (plus CARD_WIDTH/2 alignment) of the node's
  dependencies' resolved positions when it has any, else the next free slot; sort each row's
  unplaced nodes by ticket number for determinism, then resolve collisions against both saved and
  newly assigned positions in the same row by shifting right in H_GAP increments. Rearrange calls
  this with `savedPositions = {}` to recompute everything in scope.

Tests: scope resolution with nesting and absent parents; isGroup with archived members absent from
input; re-routing to group representatives and deduping; external edge directions; depth rules
including "above every one of them" (depth = 1 + max); auto layout determinism, bottom row at y=0,
no two nodes at overlapping x in a row, respect for saved positions.

Why: PRD Layout and Group card sections; pure-function module rule from CLAUDE.md.

### Step 11: forest-geometry.ts (viewport, selection, bezier)

Files: create `src/components/forest/forest-geometry.ts` and
`src/components/forest/forest-geometry.test.ts`.

Exports (all pure):

- `Viewport = { tx: number; ty: number; scale: number }`.
- `screenToWorld(viewport, sx, sy)`, `worldToScreen(viewport, wx, wy)`.
- `zoomAt(viewport, sx, sy, deltaY): Viewport` — multiplicative factor `Math.exp(-deltaY * 0.001)`,
  scale clamped to [0.2, 2.5], anchor point invariant:
  `tx' = sx - (sx - tx) * (s'/s)` (same for ty). Wheel with no modifier keys per PRD.
- `viewportAnchor(viewport, width, height): { x, y, scale }` — world coords of the bottom-middle
  screen point (persistence shape).
- `viewportFromAnchor(anchor, width, height): Viewport`.
- `initialViewport(nodePositions, width, height): Viewport` — first-open rule: horizontal center of
  the depth-0 (largest y) row's bounding box, scale 1, bottom row positioned ~120px above the
  bottom edge (PRD: focused on the bottom row, horizontally centered). With no nodes, center on
  world origin.
- `rectFromPoints(a, b)` and `rectsIntersect(a, b)` — selection rectangle vs card rect (cards are
  `{ x, y, w: CARD_WIDTH, h: CARD_HEIGHT }`); tickets intersecting the rectangle become selected.
- `selectionBoundingBox(cardRects): rect | undefined` — for the floating Group button placement.
- `edgePath(fromCard, toCard): string` — SVG cubic bezier from the top-center of the depended-on
  card to the bottom-center of the dependent card, control points offset vertically by
  `min(120, |dy| * 0.5)` (PRD: from top edge of depended-on to bottom edge of dependent).
- `externalEdgePath(memberCard, direction, scopeBounds): string` — a bezier running off the map:
  from the card's bottom-center downward past scopeBounds for `down`, from top-center upward for
  `up`.
- `DRAG_THRESHOLD_PX = 5` — pointer movement below this is a click (opens the dialog), above is a
  drag.
- `EDGE_HIT_WIDTH_PX = 32` — screen-space width of the click zone around a line (rendered as a
  transparent stroke of width `32 / scale` in world units so it stays 32px on screen).

Tests: round-trip transforms; zoomAt keeps the cursor's world point fixed and clamps; anchor
save/restore round-trip across a container resize; initialViewport centering; rect intersection
edge cases; edgePath endpoints.

Why: PRD Forest View surface and Dependency lines; keeping all math pure keeps the components thin
and testable, per CLAUDE.md component architecture.

### Step 12: forest-local-state.ts (localStorage persistence)

Files: create `src/components/forest/forest-local-state.ts` and
`src/components/forest/forest-local-state.test.ts`.

Exports, all taking a `storage: { getItem(k: string): string | null; setItem(k: string, v: string): void }`
parameter (theme-toggle-pure pattern; jsdom localStorage in tests):

- `getViewMode(storage, projectSlug): 'kanban' | 'forest'` — default `'kanban'` on
  missing/invalid/throwing storage.
- `setViewMode(storage, projectSlug, mode): void`.
- `getForestViewport(storage, projectSlug): { x: number; y: number; scale: number } | undefined` —
  undefined on missing/invalid JSON (triggers the first-open rule).
- `setForestViewport(storage, projectSlug, anchor): void`.

Keys: `view-mode:{projectSlug}`, `forest-viewport:{projectSlug}`.

Why: PRD Local UI state — per machine, keyed by projectSlug, persisted across restarts.

Acceptance (Steps 10-12): all new unit tests pass; modules import nothing from solid-js.

## Part 5 — Client UI

### Step 13: ForestCard component

Files: create `src/components/forest/ForestCard.tsx`.

Content: renders one card at absolute position (style `left/top` from position, fixed
`width: CARD_WIDTH px`, `min-height: CARD_HEIGHT px`). Semi-transparent background readable in both
themes: `bg-card/75 border border-border rounded-md shadow-sm backdrop-blur-[2px]`, ticket number
in `text-primary text-sm font-medium`, title `text-sm line-clamp-2` (visual language of the kanban
TicketCard without its menu/DnD attributes). Props: `ticket`, `position`, `selected` (adds
`ring-2 ring-primary`), `group: boolean`, pointer-event callbacks, and for groups an overflow menu
(MenuRoot/MenuTrigger three-dots, items "Ungroup" and "Open group ticket") plus a distinct look
(thicker/dashed border e.g. `border-2 border-dashed` and a small stacked-rectangles glyph next to
the number). Connector handles: two absolutely positioned 12px circles at top-center and
bottom-center, rendered only while the card is hovered (CSS `group-hover` or a hover signal from
the parent), each with `onPointerDown` starting edge creation.

data-testids: `forest-ticket-card` (with `data-ticket-number` attribute), `forest-group-card`,
`forest-handle-top`, `forest-handle-bottom`, `forest-group-menu-trigger`,
`forest-group-menu-ungroup`, `forest-group-menu-open-ticket`.

Why: PRD Ticket card and Group card sections; R8 (separate component instead of forcing TicketCard
reuse).

Acceptance: `tsc` clean; rendering asserted by e2e in Step 17; both light and dark mode use theme
tokens only (no hardcoded colors).

### Step 14: ForestSurface + controller (one scope: pan, zoom, select, drag, edges)

Files: create `src/components/forest/forest-view-state.ts` and
`src/components/forest/ForestSurface.tsx`.

forest-view-state.ts — `createForestSurfaceController(deps)` where deps provide: `tickets()`
(ForestTicket[] for the whole project), `scopeGroupNumber` (undefined for root), `layout()`
(ForestLayout from the query merged with local optimistic updates), callbacks
`onPersistPositions(positions)`, `onAddDependency(folderName, dependencyNumber)`,
`onRemoveDependency(folderName, dependencyNumber)`, `onOpenTicket(ticket)`,
`onOpenGroup(ticketNumber, cardScreenRect)`, `onGroupSelection(memberNumbers, bboxScreenPoint)`,
`onError(errorInfo)`, `initialViewport()` and `onViewportChange(viewport)`.

State (separate signals grouped by update trigger, per CLAUDE.md): `viewport`,
`interaction` (discriminated union: `{ kind: 'idle' } | { kind: 'panning'; ... } | { kind: 'selecting'; startWorld; currentWorld } | { kind: 'draggingCards'; startWorld; currentWorld; startPositions: ForestLayout } | { kind: 'draggingEdge'; fromNumber; fromEnd: 'top' | 'bottom'; pointerWorld }`),
`selection: Set<string>` (ticket numbers), `edgePopup?: { fromNumber; toNumber; screenX; screenY }`,
`localPositions` (optimistic overrides merged over the query layout). Derived accessors compute:
scope nodes (`resolveScope`), effective internal/external edges, resolved positions
(saved + local + `autoLayoutPositions` for the rest), card rects, selection bbox.

Commands implement the interaction rules:

- Pointer down on empty surface: shift held -> `selecting`, else `panning`. Move updates; up ends.
  Selecting sets `selection` to tickets whose card rect intersects the rectangle. Pan/zoom end (and
  wheel, debounced ~200ms) calls `onViewportChange`.
- Wheel: `zoomAt` toward the cursor.
- Pointer down on a card: below DRAG_THRESHOLD on up -> click (group card: `onOpenGroup`; ticket:
  `onOpenTicket`). Beyond threshold: `draggingCards` moving the card, or all selected cards when
  the card is in the current selection; on up, write moved positions into `localPositions` and call
  `onPersistPositions` with exactly the moved entries.
- Pointer down on a handle: `draggingEdge`; a live bezier follows the pointer; on release over a
  card, resolve direction per PRD (drag from bottom handle of A onto B, or from top handle of B
  onto A, both mean "A depends on B" — dependent is the bottom-handle side), then
  `onAddDependency(dependentFolderName, dependencyNumber)`; release over empty space cancels.
- Edge click (on the 32px hit path): set `edgePopup` at the click point.
- `rearrange()`: `autoLayoutPositions(scopeNodes, internalEdges, {})`, apply to localPositions,
  `onPersistPositions` with all of them (overwrites saved positions of the visible forest only).

ForestSurface.tsx renders: the clipping container (`relative h-full w-full overflow-hidden
select-none touch-none`), the Rearrange button absolutely at top-left (`btn-secondary`,
`data-testid="forest-rearrange-button"`, disabled while a persist is in flight rather than changing
text), the transformed world div containing first an SVG layer (`overflow-visible`, edges behind
cards: for each internal edge a visible path `stroke-muted-foreground` fill none + an invisible
sibling hit path `stroke-width={32 / scale}` `pointer-events-stroke`
`data-testid="forest-edge"` with `data-from`/`data-to`; external edges as `forest-external-edge`
paths, non-interactive; the live drag edge while `draggingEdge`), then a ForestCard per scope node,
then the selection rectangle div while `selecting` (`border border-primary bg-primary/10`,
`data-testid="forest-selection-rect"`). Outside the world div, in screen space: the floating Group
button shown when `selection.size >= 2`, positioned at the top edge of the selection bounding box
(`worldToScreen`), `data-testid="forest-group-button"`, onClick calls `onGroupSelection`; and the
edge popup while set — a small Portal card at the click point with one destructive action "Delete
dependency" (`data-testid="forest-edge-delete"`), dismissed on outside click/Escape. Use Portal for
the popup; DOM order (edges layer before cards layer) provides stacking — no z-index anywhere.

Pointer handling uses `setPointerCapture` on the container; all coordinate math delegates to
forest-geometry.

Why: PRD Forest View surface, Ticket card, Selection and grouping, Dependency lines; R8.

Acceptance: `tsc` clean; behavior verified by Step 17 e2e (pan persists viewport, selection,
drag-persist, edge create/delete, rearrange writes layout file).

### Step 15: ForestView (data wiring, grouping dialog, sub-forest overlays, errors)

Files: create `src/components/forest/ForestView.tsx`.

Content: props `{ board: BoardState; projectSlug: string; onViewDetail: (ticket: TicketInfo) => void }`.

- Data: `const layout = createAsync(() => getForestLayout(props.projectSlug));` tickets from
  `props.board.tickets` (the project-page query already returns every non-archived ticket
  regardless of status, which is exactly the PRD's "all non-archived tickets ... including statuses
  that match no board column"; orphan-column logic is irrelevant here).
- Local error signal (`ErrorInfo | undefined`) rendered through the existing shared
  `ErrorDialog`; every mutation result with `ok: false` sets it (PRD's visible cycle/nesting
  errors).
- Mutation wiring: `addDependency`/`removeDependency`/`ungroupTicket` then
  `revalidate("project-page")`; `saveForestPositions` then `revalidate("forest-layout")` is NOT
  called (local optimistic state is authoritative; the query refetches naturally on next mount) —
  but do revalidate `"forest-layout"` after `createGroupTicket` and `ungroupTicket` since they
  rewrite positions server-side, and `"project-page"` after any membership/dependency change.
- Open-group stack: `openGroups: string[]` signal. The root ForestSurface always renders; for each
  entry in the stack render a sub-forest overlay: an absolutely positioned panel sized 90% of the
  Forest View area, centered, `bg-background border border-border rounded-lg shadow-lg`, containing
  a close button top-right (`btn-icon`, `data-testid="forest-subforest-close"`) and a nested
  ForestSurface with `scopeGroupNumber` set. Opening animates: capture the group card's screen rect
  from `onOpenGroup`, render the overlay initially transformed to that rect
  (translate+scale computed from the two rects), then on the next frame transition
  (`transition-transform duration-200`) to identity. Overlays stack in DOM order (Portal not
  required inside the view container; later siblings paint on top — no z-index). Each sub-forest
  gets a transient viewport initialized by the first-open rule scoped to its members; only the root
  surface persists its viewport to localStorage (`setForestViewport`), matching the PRD's
  per-project Forest Viewport.
- Sub-forest interactions are identical by construction (same ForestSurface); its Rearrange
  recomputes only that scope; grouping inside it passes `parentGroupNumber = scope`.
- Grouping flow: `onGroupSelection(memberNumbers, bbox)` stores the pending member set and opens
  the existing `CreateTicketDialog` (number auto-suggested as usual via the route-provided
  `suggestedNextNumber`/`suggestTicketNumber` — pass `projectSlug` and a custom `onSubmit` that
  maps member numbers to folderNames, computes a group position from the selection bbox center in
  the current scope's coordinate space, and calls `createGroupTicket(projectSlug, number, title,
  memberFolderNames, parentGroupNumber, position)`); on success clear the selection and revalidate.
  This reuses the dialog exactly as the PRD specifies (auto-suggested number, required title).
- Group card menu: "Open group ticket" calls `props.onViewDetail(groupTicket)` (opens the existing
  Ticket Detail Dialog); "Ungroup" calls `ungroupTicket`.
- Click on a ticket card calls `props.onViewDetail`.

Why: PRD View toggle, Group card, Selection and grouping; keeps ForestSurface scope-agnostic so
root and sub-forests share one implementation.

Acceptance: `tsc` clean; e2e Step 17 covers grouping, sub-forest open/close, ungroup, detail-dialog
open from a forest card.

### Step 16: View toggle in the project route

Files: `src/routes/project/[projectSlug].tsx`.

Changes:

- `const ForestView = clientOnly(() => import("~/components/forest/ForestView"));` next to the
  KanbanBoard clientOnly import.
- View mode signal: initialize `'kanban'`, then in an effect keyed on `projectSlug()` read
  `getViewMode(localStorage, projectSlug())` (client-only; guard `typeof window`) — same
  hydration-safe approach as ThemeToggle. Toggling writes `setViewMode` and flips the signal.
- Header: add an icon button after ThemeToggle (existing `btn-icon` styling), tree icon SVG
  (lucide-style trees path, stroke currentColor, 16x16 like the neighbors), `title` reflecting the
  target mode ("Forest view" / "Kanban view"),
  `data-testid="project-header-forest-toggle-button"`. Do not change button text while switching;
  it is an instant toggle.
- Main area: inside the loaded Match, render `<Show when={viewMode() === 'forest'} fallback={<KanbanBoard ... />}>
  <ForestView board={loaded().board} projectSlug={d().projectSlug} onViewDetail={commands.openDetail} /></Show>`.
  KanbanBoard's props and the rest of the page are untouched (R5).

Why: PRD View toggle — icon button among the existing icon buttons, persisted per project, main
area swap, light/dark via theme tokens.

Acceptance: toggling swaps views without a reload; reload reopens in the saved mode (e2e); kanban
e2e suites still pass unchanged.

## Part 6 — End-to-end tests, spec, verification

### Step 17: e2e coverage

Files: create `e2e/forest-view.test.ts` and `e2e/forest-grouping.test.ts` (split for runtime);
`e2e/fixtures.ts` helpers were added in Step 5.

Both use `setupE2E()`, `createProject` with seeded tickets (`withBoards` default kanban is fine),
`gotoProject`, then click `project-header-forest-toggle-button`. Assert on real side effects
(status.json via `readTicketStatus`, forest-layout.json via `readForestLayout`, localStorage via
`getLocalStorageItem`). Never stub app server functions.

forest-view.test.ts scenarios:

1. Toggle + persistence: seed 3 tickets (A depends on nothing, B dependsOn [A], C dependsOn [A,B]);
   toggle; `forest-ticket-card` count is 3; `view-mode:{projectSlug}` localStorage equals
   `"forest"`; reload page -> forest still shown; toggle back -> kanban columns visible.
2. Layer placement: bounding boxes satisfy y(C) < y(B) < y(A) (above = smaller screen y).
3. Create dependency: seed A and B unrelated; hover B to reveal handles; mouse-drag from
   `forest-handle-bottom` of B onto A's card; assert B's status.json `dependsOn` contains A's
   number and a `forest-edge` path exists.
4. Cycle rejection: seed B dependsOn [A]; drag from A's bottom handle onto B; assert the error
   dialog is visible with the cycle message and A's status.json has no dependsOn.
5. Delete dependency: click on the edge midpoint (hit zone), click `forest-edge-delete`; assert
   dependsOn removed on disk and the edge gone.
6. Drag card persists: drag a card ~150px; assert forest-layout.json gains an entry for its number;
   reload; the card's bounding box reflects the saved position.
7. Rearrange: click `forest-rearrange-button`; assert forest-layout.json has entries for all seeded
   ticket numbers.
8. Viewport persistence: pan the empty surface, reload, assert
   `forest-viewport:{projectSlug}` localStorage exists and the view restored (compare a card's
   bounding box before/after reload within a tolerance).

forest-grouping.test.ts scenarios:

1. Rectangle selection + grouping: seed 2 tickets; shift-drag a rectangle over both;
   `forest-group-button` appears; click; CreateTicketDialog opens with an auto-suggested number;
   type a title; submit; assert on disk: new group ticket folder exists with the first column's
   status, both members' memberOf equal the group number; UI: one `forest-group-card`, member cards
   hidden.
2. Sub-forest: click the group card; overlay with `forest-subforest-close` appears; both member
   cards visible inside; close works.
3. Nested grouping: inside the sub-forest select both members and group them; assert the new
   group's own memberOf equals the outer group's number.
4. Ungroup: group card overflow menu -> Ungroup; assert members' memberOf removed (top-level case)
   and the group ticket folder still exists with number/status intact.
5. Open group ticket: overflow menu -> Open group ticket -> Ticket Detail Dialog opens
   (`ticket-detail-tab-editor` visible).
6. Kanban group-unawareness: after grouping, toggle to kanban; assert the group and both members
   each render as ordinary `kanban-board-ticket-card`s in their status columns.
7. Number edit cascade through the UI: edit a depended-on ticket's number via the kanban edit
   dialog; assert the dependent's status.json dependsOn was rewritten and forest-layout.json key
   renamed.
8. Archive leaves data: archive a member via kanban; assert the other tickets' status.json
   unchanged; toggle to forest; the archived ticket is not rendered and no edge to it is drawn.

Acceptance: `npm run test:e2e` passes; `npm run test:gate` (testid coverage) passes — every
data-testid referenced by these tests exists in the components and follows the existing
`feature-element` naming.

### Step 18: Behavior spec

Files: create `spec/forest-view.md`.

Content: nested plain-English bullets (no code, short sentences, control flow as nesting) covering:
view toggle and persistence; surface interactions (pan, zoom toward cursor, shift-rectangle
selection); layout rules (bottom row, above-all-dependencies, auto layout only for unsaved
positions, Rearrange scope and overwrite); ticket card behavior; dependency lines (anchoring,
creation via handles with both drag directions, live line, cancel on empty, cycle rejection, 32px
delete zone and popup); grouping (Group button, dialog, memberOf writes, sub-forest parent
assignment); group card (hidden members, edge re-routing, sub-forest open/close, external edge
directions, nesting, ungroup semantics, open group ticket); integrity rules (acyclic graphs, number
edit rewrite, delete removal, archive untouched, absent references ignored); kanban
group-unawareness. Mirror the tone and structure of `spec/ticket-drag-to-column.md`.

Acceptance: file exists, describes the implemented behavior, uses no underscore/bold markdown.

### Step 19: Full verification

Run `npm run test:all` (tsc, eslint, unit, build, testid gate, shell, e2e) — everything must pass;
never skip e2e. Then run the app (`npm run dev`) and manually drive one full flow in both light and
dark mode: toggle to forest, create a dependency, group two tickets, open the sub-forest, ungroup,
delete the dependency, Rearrange, restart the dev server page and confirm view mode and viewport
restore.

## Step order and dependencies

1 -> 7 (layout store uses generic JSON IO); 2, 3 -> 8; 4 -> 9; 5 -> 6, 8, 10; 6 -> 8; 7 -> 8;
8 -> 9; 9 -> 15; 10, 11, 12 -> 14; 13, 14 -> 15; 15 -> 16; 16 -> 17. Steps 1-4 are strictly
behavior-preserving and each leaves `npm run test` green; commit granularity should follow the
steps.
