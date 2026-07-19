# ST-0040 Detailed Implementation Plan: Status Swatch and Herdr Agent Status icon

Working directory: `C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0040-show-color-status-rectangle-and-herdr-stat`

This plan realizes the Implementation Decisions of `product-requirement-document.md` in this ticket folder. It is sequenced seams first: steps 1-4 are behavior-preserving refactors and new unwired modules; steps 5-9 build the feature on those seams; step 10 is e2e and gates. Each step leaves the repo green (`npm run test` passes; step 10 ends with `npm run test:all`). Never run `*.shell.test.ts` files; never run `claude -p`.

## Feature summary

1. A Column in a Board Definition gains an optional Column Color (`color` field, hex string) chosen from a fixed 12-color palette (plus "none", the default) in the Settings column form (add and edit). Stored in `~/.context-launch/config/boards.json` with the column; survives rename and reorder; additive, no migration.
2. Every ticket card (kanban `TicketCard` and `ForestCard`, including group cards) renders a small Status Swatch immediately after the Ticket Number: the Column Color of the column whose Column Slug equals the ticket's status; no swatch if that column has no color; the destructive red (theme `bg-destructive`, same as the Undefined Column) if the status matches no column. Tooltip (title attribute) shows the status name.
3. After the swatch, a Herdr Agent Status icon (working = spinning loader-circle in primary color, blocked = circle-alert in amber, idle = circle-pause in muted gray, unknown = circle-question-mark in muted gray) renders when the ticket has a Herdr Agent. Tooltip shows the raw status. Display-only. No icon when the ticket has no agent.
4. Statuses come from a new app-side Herdr client core module that runs `herdr agent list`, parses its JSON, and matches agents to tickets by the naming contract `{projectSlug}--{ticketFolderName}` (same as `config-defaults/run-agent-herdr.ps1` line 21). Exposed via a `query()` server function returning a discriminated availability result (never throws; logs errors server-side); the client re-fetches every 5 seconds while a project page is open, and only when at least one Coding Agent Profile uses the Herdr Launch Target.

CONTEXT.md at the repo root has already been updated with the glossary terms Column Color, Status Swatch, Herdr Agent Status (verify; do not re-add).

## Points of resistance and their resolutions

R1. Launch Target is not a structured field. `LauncherProfile` (src/core/launcher/launcher-config.ts) is `{ name, command }`; "uses the Herdr Launch Target" is only implied by the command referencing the `run-agent-herdr` script (see `config-defaults/launcher-config.json`, profile "Claude Herdr"). Requirement 12 needs this predicate. Resolution: define it once as a pure exported function `usesHerdrLaunchTarget(command: string)` in the new Herdr core module (step 4), unit-tested, and use it only there and in the status query. Do not scatter string checks at call sites.

R2. Column mutation APIs take positional description arguments. `BoardConfigManager.addColumn(boardId, name, description?)` is positional while `updateColumn(boardId, columnName, patch)` takes a patch; the server functions `addColumn`/`updateColumn` in `src/components/board/board-api.ts` are positional; and `handleRenameColumn` in `src/components/launcher/launcher-settings-state.ts` re-applies the description with a second `updateColumn` call after a rename. Adding a fourth positional `color` argument would compound this. Resolution: seam step 1 converts the whole chain (manager, server functions, settings controller) to a shared `ColumnContentPatch` object before color exists, so step 5 adds `color` in exactly one type and one apply function, and the rename flow carries color for free.

R3. `TicketCard` cannot derive a swatch. It renders from `TicketInfo` alone (src/components/ticket/TicketCard.tsx) and has no access to the column list; `TicketColumn`/`OrphanColumn` (src/components/board/kanban-columns.tsx) receive only their own column. Resolution: rather than computing a color per call site, create one pure accessor (`resolveStatusSwatch`) plus one shared `StatusSwatch` component (step 2), and thread the full `columns` array as data through the kanban components into `TicketCard` (step 7). The Undefined Column case falls out of the accessor (status matches no column), so `OrphanColumn` needs no special casing.

R4. Forest View strips the status. `ForestTicket` (src/components/forest/forest-graph.ts) is `Pick<TicketInfo, 'number' | 'title' | 'folderName' | 'dependsOn' | 'memberOf'>` and `ForestView` builds it without status; `ForestCard` sees only `ForestNodeData`. Resolution: extend `ForestTicket` with `status` (PRD decision, step 3), and deliver the shared column list and Herdr statuses to `ForestCard` through a context provided by `ForestSurface`, following the existing `ForestCardCommandsContext` / `ForestConnectionSessionContext` pattern in ForestCard.tsx (step 8). Per-node data stays per-node; board-wide decor data is ambient.

R5. No app-side Herdr client exists. Only `run-agent-herdr.ps1` talks to the CLI, and it re-derives the agent-name contract in shell. Resolution: new core module `src/core/herdr/herdr-client.ts` (step 4) owns the contract on the app side: agent naming, `agent list` JSON parsing, the status vocabulary, and launch-target detection, with the process runner injected so unit tests never spawn. The ps1 script cannot share TypeScript code; the module's unit tests pin the same contract the existing shell test (`src/core/launcher/run-agent-herdr.shell.test.ts`) pins for the script.

R6. The only client polling precedent swallows errors. `getSyncPending` polling in `src/routes/project/[projectSlug].tsx` (lines 63-78) is a plain server function called in a `setInterval` with `catch { /* ignore */ }`. The PRD instead mandates `query()` + `createAsync` with a discriminated availability result and server-side logging. Resolution: follow the PRD shape (step 9); the query never throws, so the client needs no catch, and the interval merely calls `revalidate("herdr-agent-statuses")`. Do not copy the sync-pending pattern.

R7. The testid coverage gate conflicts with "no Herdr e2e". `scripts/testid-coverage.ts` (run by `test:gate` inside `test:all`) fails if any `data-testid` literal in src/*.tsx is not referenced from an e2e file, but the PRD forbids e2e that spawns the herdr CLI. Resolution: the e2e file (step 10) references `herdr-status-icon` by asserting it is absent (count 0) in a project seeded with an app launcher config containing no Herdr profile. That asserts requirements 11/12 behavior (feature inert without a Herdr profile) without any CLI spawn, and satisfies the gate.

R8. Clearing an optional column field. `updateColumn` clears `description` via empty string (`patch.description === '' -> undefined`). Column Color follows the same convention: the form always sends the full value; `''` means "none" and clears the field; a valid palette hex sets it. No nulls (project style prefers undefined).

## Reference data (used by several steps)

Palette (name, hex) - exactly these 12, plus "none" as default:

    gray   #6e7781    blue   #0969da    green  #1a7f37    yellow #bf8700
    orange #bc4c00    red    #cf222e    purple #8250df    pink   #bf3989
    teal   #1b7c83    cyan   #0598bc    lime   #4d8400    brown  #9a6700

Herdr agent statuses (the CLI's own vocabulary, no mapping layer): `idle`, `working`, `blocked`, `unknown`.

`herdr agent list` output shape (pinned by run-agent-herdr.shell.test.ts):

    { "id": "...", "result": { "type": "agent_list", "agents": [
      { "workspace_id": "w1", "pane_id": "w1:p2", "name": "alpha--st-47-herdr", "agent_status": "working" }
    ] } }

Agents may lack `name` (unnamed panes) - skip them. Agent name contract: `${projectSlug}--${ticketFolderName}`.

Lucide icon paths (inline SVGs, viewBox "0 0 24 24", fill none, stroke currentColor, stroke-width 2, stroke-linecap/linejoin round, width/height 12 - matching existing inline-SVG convention, e.g. ForestCard.tsx):

    loader-circle:        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    circle-alert:         <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
    circle-pause:         <circle cx="12" cy="12" r="10"/><line x1="10" x2="10" y1="15" y2="9"/><line x1="14" x2="14" y1="15" y2="9"/>
    circle-question-mark: <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>

Style rules to observe throughout: no comments unless asked; no `null` (use optional fields); no bare `slug` identifiers; no z-index; match each file's existing indentation (core files use tabs, most component files use tabs or spaces as found); errors are thrown by queries and returned as discriminated results by mutations; no silent fallbacks.

---

## Phase A - seams (behavior-preserving)

### Step 1. Unify column mutations on a ColumnContentPatch object

Why: R2. One patch type is the single seam where `color` lands in step 5, and it fixes the rename flow (which must re-apply form fields after rename) so color rides along automatically.

Files to modify:

1. `src/core/project/board-config.ts`
   - Add and export:

         export interface ColumnContentPatch {
           description?: string;
         }

   - Extract a private helper `applyColumnContent(column: ColumnDefinition, patch: ColumnContentPatch): void` containing the existing description logic (`if (patch.description != null) column.description = patch.description.trim() || undefined;`).
   - Change `addColumn(boardId: string, name: string, description?: string)` to `addColumn(boardId: string, name: string, patch: ColumnContentPatch = {})`. After creating `{ name: slugified }`, call `applyColumnContent(column, patch)`. Note: the current add path only sets description when non-blank; `applyColumnContent` with `patch.description: ''` would also leave it undefined, so behavior is preserved when callers pass `description: cf.description || undefined` (see below).
   - Change `updateColumn`'s patch parameter type from the inline `{ description?: string }` to `ColumnContentPatch` and route through `applyColumnContent`.
2. `src/components/board/board-api.ts`
   - `addColumn(boardId: string, name: string, patch: { description?: string })` -> forwards patch to the manager.
   - `updateColumn(boardId: string, columnName: string, patch: { description?: string })` -> forwards patch. (Use the `ColumnContentPatch` type import from board-config.)
3. `src/components/launcher/launcher-settings-state.ts`
   - `handleSaveColumn` edit path: `updateColumn(boardId, cf.oldName, { description: cf.description })`.
   - `handleSaveColumn` add path: `addColumn(boardId, cf.name, { description: cf.description || undefined })`.
   - `handleRenameColumn`: the post-rename call becomes `updateColumn(boardId, newName, { description: cf.description })` (both occurrences of the guard stay as-is; the guard `cf.description !== undefined` still works).
4. `src/core/project/board-config.test.ts`
   - Update `addColumn` call sites that pass a description positionally, e.g. line 312 `mgr.addColumn('standard', 'Blocked', 'Stuck tickets')` -> `mgr.addColumn('standard', 'Blocked', { description: 'Stuck tickets' })`. Assertions unchanged.
5. `src/core/project/column-rename-migration.ts` and `src/core/board/*` - grep for other `addColumn(`/`updateColumn(` callers (`Grep addColumn\(|updateColumn\(` over src/) and update signatures if any exist beyond the ones above.

Acceptance criteria:
- `npx tsc --noEmit` clean.
- `npx vitest run src/core/project/board-config.test.ts` passes with unchanged assertions.
- `npm run test` passes (no behavior change anywhere).

### Step 2. Presentation seam: pure swatch accessor, StatusSwatch, HerdrStatusIcon

Why: PRD decisions "a pure accessor derives the swatch color from a ticket status and the column list (including the undefined-status red case)" and "one shared swatch component". New modules only; nothing renders them yet, so the app is unchanged.

Files to create:

1. `src/core/board/status-swatch.ts` (pure, no solid imports)

       import type { ColumnDefinition } from '~/core/project/board-config.js';

       export type StatusSwatchAppearance =
         | { kind: 'column-color'; hex: string }
         | { kind: 'orphan-status' }
         | { kind: 'none' };

       export function resolveStatusSwatch(
         ticketStatus: string,
         columns: ColumnDefinition[],
       ): StatusSwatchAppearance

   Logic: find column with `name === ticketStatus`. No column -> `orphan-status` (requirement 7). Column without `color` -> `none` (requirement 6). Column with `color` -> `column-color` with that hex (requirement 5). (`ColumnDefinition.color` is added in step 5; until then reference `column.color` will not compile - so in this step type the parameter as `Pick<ColumnDefinition, 'name'>[] & { color?: string }`? No. Keep it simple and honest: declare a local structural type in this file:

       export interface SwatchColumn {
         name: string;
         color?: string;
       }

   and accept `SwatchColumn[]`. `ColumnDefinition` is assignable to it now and after step 5. This keeps the accessor decoupled and compiling in both states.)

2. `src/core/board/status-swatch.test.ts` - unit tests:
   - status matching a colored column -> `{ kind: 'column-color', hex }`.
   - status matching an uncolored column -> `{ kind: 'none' }`.
   - status matching no column -> `{ kind: 'orphan-status' }`.

3. `src/components/ticket/StatusSwatch.tsx`

       import { resolveStatusSwatch, type SwatchColumn } from '~/core/board/status-swatch.js';

       export default function StatusSwatch(props: { status: string; columns: SwatchColumn[] })

   Renders nothing when appearance kind is `none`. Otherwise a span:
   - `data-testid="status-swatch"`, `title={props.status}` (requirement 8), `data-status={props.status}`
   - base classes `inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]`
   - `orphan-status` -> add class `bg-destructive` (theme red, same as Undefined Column)
   - `column-color` -> `style={{ 'background-color': hex }}`
   Use `Show`/a memo over `resolveStatusSwatch(props.status, props.columns)` so reactivity tracks both props.

4. `src/components/ticket/HerdrStatusIcon.tsx`

       import type { HerdrAgentStatus } from '~/core/herdr/herdr-client.js';   // created in step 4; in this step declare the union locally and swap the import in step 4, or do step 4 first - see ordering note below

       export default function HerdrStatusIcon(props: { status: HerdrAgentStatus })

   Ordering note: to avoid a throwaway local type, implement step 4 (herdr core module) before this file, or create the two steps in the same commit series with step 4's type file first. The plan keeps them as separate steps; execute 4 before the icon file if you prefer a single source for the type.

   Renders one svg (12x12, classes per status) with `data-testid="herdr-status-icon"`, `data-herdr-status={props.status}`, `title={props.status}` on a wrapping span (title on span so the tooltip works uniformly):
   - working: loader-circle path, classes `animate-spin text-primary`
   - blocked: circle-alert, class `text-amber-500`
   - idle: circle-pause, class `text-muted-foreground`
   - unknown: circle-question-mark, class `text-muted-foreground`
   No click handlers (requirement 14). Use a `Switch`/record lookup keyed by status; do not silently default - the type is a closed union.

5. `src/components/ticket/HerdrStatusIcon.test.tsx` - render tests (jsdom project picks up `*.test.tsx`): for each of the four statuses assert the testid exists with the right `data-herdr-status`, the working icon has `animate-spin` and `text-primary`, blocked has `text-amber-500`, idle/unknown have `text-muted-foreground`, and the title attribute equals the raw status.

Acceptance criteria:
- `npx vitest run src/core/board/status-swatch.test.ts src/components/ticket/HerdrStatusIcon.test.tsx` passes.
- `npm run test` passes; UI unchanged (components not yet referenced). Note: eslint must pass; unused-export rules are not in play, but make sure no unused imports remain.

### Step 3. Forest node data carries the ticket status

Why: PRD decision "Forest View node data is extended to carry the ticket status, which it currently does not." Behavior-preserving: the field is added and populated but unused until step 8.

Files to modify:

1. `src/components/forest/forest-graph.ts`
   - `export type ForestTicket = Pick<TicketInfo, 'number' | 'title' | 'status' | 'folderName' | 'dependsOn' | 'memberOf'>;`
2. `src/components/forest/ForestView.tsx`
   - In the `tickets` memo (lines 61-67), add `status: ticket.status,` to the mapped object.
3. Test fixtures that construct `ForestTicket` literals now need `status`. Update builders in:
   - `src/components/forest/forest-graph.test.ts`
   - `src/components/forest/forest-flow-model.test.ts`
   - `src/components/forest/forest-connections.test.ts` (if it builds tickets)
   Each has a `makeTicket`-style helper or inline literals; add `status: 'todo'` (or thread through overrides). Grep `ForestTicket` in src to catch all constructors.

Acceptance criteria:
- `npx tsc --noEmit` clean; `npm run test` passes.
- No rendering change (nothing reads the new field yet).

### Step 4. Herdr core module: the app-side Herdr client

Why: PRD decision "A new Herdr core module is the app-side Herdr client (none exists today; only the launch script talks to Herdr)". Also hosts the Launch Target predicate (R1). New, unwired module.

Files to create:

1. `src/core/herdr/herdr-client.ts` (tabs, matching core style). Contents:

   - `export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'unknown';`
   - `const HERDR_AGENT_STATUSES: ReadonlySet<string>` of the four values.
   - `export function usesHerdrLaunchTarget(command: string): boolean` - returns `command.includes('run-agent-herdr')`. This is the app-wide definition of "profile uses the Herdr Launch Target" (matches the default profile command `powershell -File {{configDefaultsDir}}/run-agent-herdr.ps1 ...`).
   - `export function herdrAgentName(projectSlug: string, folderName: string): string` returning `` `${projectSlug}--${folderName}` `` - the naming contract, exported so tests pin it.
   - `export interface HerdrCommandResult { exitCode: number; stdout: string; stderr: string; }`
   - `export type HerdrCommandRunner = (args: string[]) => Promise<HerdrCommandResult>;`
   - `export function parseHerdrAgentList(stdout: string): { name?: string; agentStatus: HerdrAgentStatus }[]` - `JSON.parse`; validate `result.agents` is an array, else throw `new Error('Unexpected herdr agent list output: ...')` (truncate raw output to ~500 chars in the message). For each agent: `name` from `agent.name` when it is a string (skip nothing here - keep unnamed entries with `name` undefined, matching lets the caller filter); `agentStatus` = `agent.agent_status` when it is a string in `HERDR_AGENT_STATUSES`, otherwise `'unknown'` (the CLI's own bucket for unrecognized state; not a silent fallback - the icon shows a question mark).
   - `export function ticketStatusesFromAgents(agents, projectSlug): Record<string, HerdrAgentStatus>` - for agents whose `name` starts with `` `${projectSlug}--` ``, key = name without the prefix (the ticket folder name), value = agentStatus. Later duplicates overwrite earlier ones (documented by a unit test; a Ticket never has concurrent Herdr Agents in one workspace, so duplicates are pathological).
   - `export async function fetchHerdrTicketStatuses(projectSlug: string, runHerdr: HerdrCommandRunner = defaultHerdrRunner): Promise<Record<string, HerdrAgentStatus>>` - runs `runHerdr(['agent', 'list'])`; if `exitCode !== 0` throw `new ProcessError('herdr agent list', exitCode, stderr || stdout)` (import from `~/core/shared/errors.js`); else parse and map.
   - `defaultHerdrRunner` (not exported): uses `spawn` from `cross-spawn` (already a dependency; handles Windows .cmd shims - see `src/core/launcher/spawn-detached.ts` for precedent): `spawn('herdr', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })`; collect stdout/stderr; resolve on `close` with the exit code (`code ?? -1` only after documenting: use `exitCode: code === null ? -1 : code`); reject on the `error` event (ENOENT when the CLI is not installed); enforce a 10 second timeout that kills the child and rejects with `new Error('herdr agent list timed out after 10s')` so 5-second polling cannot pile up hung processes.

2. `src/core/herdr/herdr-client.test.ts` - unit tests with an injected runner (no real spawns, per PRD testing decisions):
   - parses the pinned JSON shape and returns `{ 'st-47-herdr': 'working' }` for projectSlug `alpha` (reuse the exact JSON strings from `run-agent-herdr.shell.test.ts` so both sides pin the same contract).
   - skips unnamed agents.
   - skips agents whose name does not start with `${projectSlug}--` (e.g. another project's agents).
   - maps an out-of-vocabulary `agent_status` to `unknown`.
   - throws on non-JSON stdout and on missing `result.agents`.
   - throws ProcessError when exitCode is nonzero (message contains stderr).
   - `usesHerdrLaunchTarget`: true for the default Herdr profile command, false for `run-agent.ps1` / `run-agent.sh` commands.
   - `herdrAgentName('alpha', 'st-47-herdr') === 'alpha--st-47-herdr'`.

Acceptance criteria:
- `npx vitest run src/core/herdr/herdr-client.test.ts` passes without spawning anything (verify no console windows / no `herdr` in the runner by construction: tests pass a fake runner).
- `npm run test` passes.

---

## Phase B - implementation

### Step 5. Column Color storage in the Board Definition

Files to create:

1. `src/core/project/column-color-palette.ts`

       export interface ColumnColorOption { name: string; hex: string; }
       export const COLUMN_COLOR_PALETTE: ColumnColorOption[] = [ /* the 12 entries above, in the listed order */ ];
       export function requireColumnColor(hex: string): string

   `requireColumnColor` throws `new Error(\`Column color "${hex}" is not in the preset palette\`)` unless hex is one of the 12; returns hex. (Free-form colors must be rejected at the API boundary - requirement 2 and the no-silent-fallback rule.)

Files to modify:

2. `src/core/project/board-config.ts`
   - `ColumnDefinition` gains `color?: string;`.
   - `ColumnContentPatch` gains `color?: string;`.
   - `applyColumnContent` gains:

         if (patch.color != null) {
           column.color = patch.color === '' ? undefined : requireColumnColor(patch.color);
         }

   - No changes to `renameColumn` / `reorderColumns` are needed: rename mutates `column.name` on the same object and reorder re-maps existing objects, so color survives both (requirement 3) - pin with tests, not code.
   - No migration: `loadAll`/`migrateColumns` already pass object columns through untouched; old files without `color` remain valid.
3. `src/core/board/board-types.ts`
   - `AddColumnBody` and `UpdateColumnBody` gain `color: v.optional(v.string())` (they mirror the API surface even though nothing imports them today).
4. `src/components/board/board-api.ts`
   - The `patch` parameter types of `addColumn` and `updateColumn` become `{ description?: string; color?: string }` (or import `ColumnContentPatch`). Pass-through only; validation lives in the manager, errors surface through the existing `errorResult` envelope.
5. `src/core/project/board-config.test.ts` - add tests:
   - `addColumn('standard', 'Blocked', { color: '#0969da' })` stores the color; boards.json round-trips it (existing tests use a ConfigRepository test double - follow the file's established createManager pattern).
   - `addColumn` with a non-palette color (`'#123456'`) throws `not in the preset palette` and writes nothing.
   - `updateColumn` sets a color; `updateColumn` with `{ color: '' }` clears it; `updateColumn` with a non-palette color throws.
   - color survives `renameColumn` (rename `todo` and assert the renamed column keeps its color) and `reorderColumns`.
6. `src/core/project/column-color-palette.test.ts` (or fold into board-config.test.ts): palette has exactly 12 entries, all distinct, and `requireColumnColor` accepts each and rejects others.
7. `src/core/board/status-swatch.ts` - if the `SwatchColumn` structural type was used in step 2, it already matches; optionally re-export nothing. No change required.

Acceptance criteria:
- `npx vitest run src/core/project` passes including the new tests.
- `npm run test` passes.
- Manual check (optional): a hand-edited boards.json with `"color": "#0969da"` on a column loads without error via existing flows.

### Step 6. Settings UI: palette picker in the column form

Files to modify:

1. `src/components/launcher/launcher-settings-dialogs.tsx`
   - `ColumnFormState` gains `color: string;` (empty string = none).
   - `ColumnFormDialog` gains a "Color" block between Description and the footer:

         <div>
           <label class="mb-1 block text-sm text-muted-foreground">Color (optional)</label>
           <div class="flex flex-wrap items-center gap-1.5">
             ... none button + 12 swatch buttons ...
           </div>
         </div>

     - None option: a button `data-testid="launcher-settings-columns-color-none"`, `title="None"`, `aria-label="No color"`, rendered as an outlined square with a diagonal line (border + a small inline svg line), selected when `cf().color === ''`.
     - One button per `COLUMN_COLOR_PALETTE` entry (import from `~/core/project/column-color-palette.js`): `data-testid="launcher-settings-columns-color-option"`, `data-color-hex={option.hex}`, `title={option.name}`, `aria-label={option.name}`, class `h-6 w-6 rounded-md border border-border`, `style={{ 'background-color': option.hex }}`.
     - Selection indicator on the active button (none or hex match): add classes `ring-2 ring-primary ring-offset-2 ring-offset-background` and `data-selected=""` attribute (styling only; no z-index).
     - onClick: `props.setColumnForm({ ...cf(), color: option.hex })` / `''` for none. `type="button"` so it never submits.
2. `src/components/launcher/launcher-settings-columns-tab.tsx`
   - Add form open: `props.setColumnForm({ mode: 'add', name: '', description: '', color: '' })`.
   - Edit form open: add `color: col.color ?? ''`.
3. `src/components/launcher/launcher-settings-state.ts`
   - `handleSaveColumn` edit path: `updateColumn(boardId, cf.oldName, { description: cf.description, color: cf.color })` ('' clears - R8).
   - `handleSaveColumn` add path: `addColumn(boardId, cf.name, { description: cf.description || undefined, color: cf.color || undefined })`.
   - `handleRenameColumn` post-rename call: `updateColumn(boardId, newName, { description: cf.description, color: cf.color })`. The surrounding guard `cf && cf.description !== undefined` still holds (both fields always present on the form); leave the guard as-is.

Why here and not a color input: requirement 2 (fixed palette, one row of swatches) and Out of Scope (no free-form input).

Acceptance criteria:
- `npm run test` passes (tsc + eslint + unit).
- Manual: `npm run dev`, open Settings > Columns > Add/Edit - palette row renders, picking a color then Save writes `"color"` into `~/.context-launch/config/boards.json` (or dev data dir); reopening Edit pre-selects it; picking None clears it. (Automated coverage lands in step 10's e2e; the two new testids will be referenced there.)

### Step 7. Kanban wiring: swatch and icon slot on TicketCard

Files to modify:

1. `src/components/ticket/TicketCard.tsx`
   - Props gain:

         columns: SwatchColumn[];              // from ~/core/board/status-swatch.js
         herdrStatus?: HerdrAgentStatus;       // from ~/core/herdr/herdr-client.js

   - Replace the number span block with a flex row so the badges sit immediately after the Ticket Number (requirement 4):

         <div class="flex min-w-0 items-center gap-1.5">
           <span class="text-sm font-medium text-primary">{props.ticket.number}</span>
           <StatusSwatch status={props.ticket.status} columns={props.columns} />
           <Show when={props.herdrStatus}>
             {(s) => <HerdrStatusIcon status={s()} />}
           </Show>
         </div>

     (Requirement 11: no icon when `herdrStatus` is undefined - the ticket has no Herdr Agent.)
2. `src/components/board/kanban-columns.tsx`
   - `TicketColumnProps` gains `columns: ColumnDefinition[];` and `herdrStatuses: Record<string, HerdrAgentStatus>;` (shared by both column components).
   - `SortableTicketCard` and `DropPreview` gain and forward `columns` and per-ticket `herdrStatus={props.herdrStatuses[ticket.folderName]}`.
   - `TicketColumn` and `OrphanColumn` forward both. `OrphanColumn` passes the real `columns` - the accessor resolves orphaned statuses to destructive red on its own (R3), keeping the existing `orphanedStatus` text untouched.
3. `src/components/board/KanbanBoard.tsx`
   - Public props gain `herdrStatuses?: Record<string, HerdrAgentStatus>;` (absent means "no Herdr information", the normal state for non-Herdr users; not a fallback - it is the domain meaning of absence).
   - Define `const herdrStatuses = () => props.herdrStatuses ?? {};` and pass `columns={props.board.columns}` and `herdrStatuses={herdrStatuses()}` to `TicketColumn`, `OrphanColumn`, and thread into the `DragOverlay`'s `TicketCard` (`columns={props.board.columns}` and `herdrStatus={herdrStatuses()[t().folderName]}`) and `DropPreview`.
4. `src/components/ticket/TicketCard.test.tsx`
   - `makeTicket` unchanged; every `<TicketCard ...>` gains `columns={[]}`.
   - Add cases:
     - renders the swatch with the column color: `columns={[{ name: 'todo', color: '#1a7f37' }]}`, assert `[data-testid="status-swatch"]` exists with inline background-color `rgb(26, 127, 55)` and `title="todo"`.
     - no swatch when the matching column has no color.
     - destructive swatch when status matches no column: assert class list contains `bg-destructive`.
     - `herdrStatus="working"` renders `[data-testid="herdr-status-icon"][data-herdr-status="working"]`; no `herdrStatus` renders no icon.
5. `src/components/board/KanbanBoard.render.test.tsx`
   - Existing tests compile unchanged (new KanbanBoard prop is optional).
   - Add a describe "KanbanBoard status swatches" following the file's makeBoard pattern:
     - board with `[{ name: 'todo', color: '#0969da' }, { name: 'done' }]` and one ticket per column: exactly one swatch, on the todo card.
     - orphaned ticket (status not in columns): its card's swatch has `bg-destructive`.
   - Add a describe "KanbanBoard herdr icons": pass `herdrStatuses={{ 't-1-alpha': 'blocked' }}`; assert one icon with `data-herdr-status="blocked"`; assert zero icons when the prop is omitted.

Acceptance criteria:
- `npx vitest run src/components/ticket/TicketCard.test.tsx src/components/board/KanbanBoard.render.test.tsx` passes.
- `npm run test` passes. The route still compiles without passing `herdrStatuses` (optional prop); kanban shows swatches for colored columns already when run manually.

### Step 8. Forest wiring: swatch and icon on ForestCard (including group cards)

Files to modify:

1. `src/components/forest/ForestCard.tsx`
   - Add, next to the existing contexts:

         export interface ForestCardStatusData {
           columns: SwatchColumn[];
           herdrStatuses: Record<string, HerdrAgentStatus>;
         }
         export const ForestCardStatusContext = createContext<() => ForestCardStatusData>();

     plus a `requireCardStatusData()` helper mirroring `requireCardCommands` (throws "Forest card status data is unavailable" when missing - no silent default).
   - In the card markup, inside the existing `div.flex.items-center.gap-1` that holds the group icon and the number span, after the number span add:

         <StatusSwatch status={props.data.ticket.status} columns={statusData().columns} />
         <Show when={statusData().herdrStatuses[props.data.ticket.folderName]}>
           {(s) => <HerdrStatusIcon status={s()} />}
         </Show>

     Group cards use the same path (`props.data.ticket` is the group's own ticket), satisfying requirement 4 for group cards.
2. `src/components/forest/ForestSurface.tsx`
   - `ForestSurfaceData` gains `columns: ColumnDefinition[];` and `herdrStatuses: Record<string, HerdrAgentStatus>;` (data type - fields only, per component-architecture rules).
   - Wrap the existing providers with `ForestCardStatusContext.Provider value={() => ({ columns: props.data.columns, herdrStatuses: props.data.herdrStatuses })}`.
3. `src/components/forest/ForestView.tsx`
   - Props gain `herdrStatuses?: Record<string, HerdrAgentStatus>;`.
   - `const herdrStatuses = () => props.herdrStatuses ?? {};`
   - Both `ForestSurface` usages (root, line ~230, and sub-forest overlay, line ~251) add `columns: props.board.columns, herdrStatuses: herdrStatuses(),` to their `data` objects (the `satisfies ForestSurfaceData` will enforce it).

Acceptance criteria:
- `npx tsc --noEmit` clean; `npm run test` passes (forest unit tests unaffected - they test pure modules, not ForestCard).
- Manual: `npm run dev`, color a column, toggle Forest View - cards of that status show the swatch; a ticket with an unmatched status shows the red swatch; group cards show their own status swatch. Sub-forest overlays show swatches too.

### Step 9. Herdr status query, 5-second polling, and route wiring

Files to create:

1. `src/components/board/herdr-status-api.ts`

       import { query } from "@solidjs/router";
       import { launcherConfigManager } from "~/core/config/instances.js";
       import { appLog } from "~/core/infra/app-logger.js";
       import { errorMessage } from "~/core/shared/errors.js";
       import {
         fetchHerdrTicketStatuses, usesHerdrLaunchTarget, type HerdrAgentStatus,
       } from "~/core/herdr/herdr-client.js";

       export type HerdrAgentStatusesResult =
         | { kind: "disabled" }
         | { kind: "available"; statusesByFolderName: Record<string, HerdrAgentStatus> }
         | { kind: "unavailable" };

       export const getHerdrAgentStatuses = query(async (
         projectSlug: string,
       ): Promise<HerdrAgentStatusesResult> => {
         "use server";
         const merged = launcherConfigManager.getMergedConfig(projectSlug);
         if (!merged.profiles.some(p => usesHerdrLaunchTarget(p.command))) {
           return { kind: "disabled" };
         }
         try {
           return {
             kind: "available",
             statusesByFolderName: await fetchHerdrTicketStatuses(projectSlug),
           };
         } catch (e) {
           appLog("herdr", `agent status query failed: ${errorMessage(e)}`);
           return { kind: "unavailable" };
         }
       }, "herdr-agent-statuses");

   Rationale: discriminated availability result instead of throwing plus server-side error logging is requirement 13 / the PRD data-access decision; `disabled` performs no spawn, making the feature inert without a Herdr profile (requirement 12). The catch is not a swallow: the error is logged to the app log (visible in the Log Viewer) and encoded in the result - the PRD explicitly decides "no error indicator in the UI".

Files to modify:

2. `src/routes/project/[projectSlug].tsx`
   - Import `getHerdrAgentStatuses` and add near the sync-pending block:

         const herdrStatusesResult = createAsync(() => getHerdrAgentStatuses(projectSlug()));
         const herdrPollingActive = createMemo(() => {
           const result = herdrStatusesResult();
           return !!result && result.kind !== "disabled";
         });
         createEffect(() => {
           if (!herdrPollingActive()) return;
           const timer = setInterval(() => void revalidate("herdr-agent-statuses"), 5000);
           onCleanup(() => clearInterval(timer));
         });
         const herdrTicketStatuses = () => {
           const result = herdrStatusesResult();
           return result?.kind === "available" ? result.statusesByFolderName : {};
         };

     Notes: the memo keys the effect on the boolean so the interval is not torn down and recreated on every poll; `unavailable` keeps polling so status recovers when Herdr returns (requirement 13); `disabled` never starts the interval (requirement 12); polling stops when the page unmounts via `onCleanup`. The empty record for `unavailable`/`disabled` is the specified rendering ("no icons are shown"), not a fallback.
   - Pass `herdrStatuses={herdrTicketStatuses()}` to both `KanbanBoard` and `ForestView`.
   - In the `LauncherSettings` `onOpenChange` close branch, alongside `revalidate("project-page")` add `revalidate("herdr-agent-statuses")` so adding/removing a Herdr profile in Settings re-evaluates the gate without a reload. (Both belong in a single `revalidate(["project-page", "herdr-agent-statuses"])` call.)

Acceptance criteria:
- `npm run test` passes.
- Manual without herdr on PATH but with the default "Claude Herdr" profile: page works, no icons, app log (Logs button) gains a `[herdr]` line every 5 seconds (requirement 13 behavior), no error dialogs. Remove/rename the Herdr profile in Settings, close Settings: polling stops (observe network/log silence).
- Manual with herdr installed (optional, only if available): launch a Herdr agent for a ticket via the Agent Launcher; within 5 seconds the ticket's card shows the spinning working icon; the icon's tooltip shows the raw status; the icon has no click behavior.

### Step 10. e2e, testid coverage gate, full suite

Files to modify:

1. `e2e/fixtures.ts`
   - `SeedColumn` gains `color?: string;` (seeded straight into boards.json - the file is written raw).
   - `BoardDefinitionShape` columns gain `color?: string` so assertions can read it.

Files to create:

2. `e2e/status-swatch.test.ts` - on the real-server harness (`setupE2E`, `createProject`, `gotoProject`, `readBoardDefinitions` from fixtures; `toggleToForest`, `forestCard`, `forestGroupCard` from forest-helpers). Seed every project with `appLauncherConfig: { templates: [{ name: "Default", text: "x" }], skills: [], profiles: [{ name: "Plain", command: "echo" }] }` so no Coding Agent Profile uses the Herdr Launch Target - the herdr query returns `disabled`, nothing spawns, and tests are deterministic (R7).

   Tests:
   - "assigning a Column Color in Settings persists to boards.json and shows the swatch on kanban and forest cards" (the PRD's mandated e2e):
     - Seed boards `[{ id: 'kanban', name: 'Kanban', columns: [{ name: 'todo' }, { name: 'done' }] }]` and tickets `[{ number: 'T-1', title: 'Alpha', status: 'todo' }]`.
     - Open Settings (existing helper `openLauncherSettings`), Columns tab (`openLauncherSettingsTab(page, 'columns')`), click the todo row's `launcher-settings-columns-edit-button`, click `[data-testid="launcher-settings-columns-color-option"][data-color-hex="#0969da"]`, submit, wait, then `readBoardDefinitions` and assert the todo column has `color: "#0969da"`.
     - Close Settings (`launcher-settings-close-button`). On the kanban card (`[data-testid="kanban-board-ticket-card"]`) assert `[data-testid="status-swatch"]` is visible, its `title` attribute is `todo` (requirement 8), and its computed `background-color` is `rgb(9, 105, 218)` (via `locator.evaluate(el => getComputedStyle(el).backgroundColor)`).
     - `toggleToForest(page)`; assert the swatch inside `forestCard(page, 'T-1')` is visible with the same background color.
   - "no swatch when the column has no color": ticket in `done` (uncolored) has no `status-swatch` element on its card.
   - "orphaned status renders the destructive swatch on kanban and forest": seed a ticket with status `vanished`; kanban undefined-column card's swatch classList contains `bg-destructive`; same on the forest card.
   - "group card shows its own status swatch": seed a group (member with `memberOf`) using the forest-helpers seeding pattern from `forest-grouping.test.ts`; assert the swatch inside `forestGroupCard(page, ...)`.
   - "picking None clears the color": edit the colored column, click `[data-testid="launcher-settings-columns-color-none"]`, submit, assert boards.json column has no `color` and the kanban card has no swatch after close.
   - "no Herdr icons without a Herdr profile": assert `page.locator('[data-testid="herdr-status-icon"]').count()` is 0 on both views (requirements 11/12; also satisfies the testid gate for `herdr-status-icon`).

   This file references the new testids `status-swatch`, `herdr-status-icon`, `launcher-settings-columns-color-option`, `launcher-settings-columns-color-none`, closing the gate (R7). Reuse existing wait patterns (`waitForSelector` with timeouts, `waitForTimeout(1000)` after mutations) from `launcher-settings-columns-tab.test.ts`.

Checks:

3. `npx tsx scripts/testid-coverage.ts` - passes (all new testids referenced).
4. Full suite: `npm run test:all` (tsc, eslint, unit incl. render, build, testid gate, e2e). Do not run `npm run test:shell`. All green with no pre-existing failures left behind.
5. Optional but recommended: `npm run dev` and walk requirements 1-11 and 14 manually once (assign each of a few palette colors, check light and dark theme readability, hover tooltips, drag a card and confirm the drag overlay card also shows the swatch).

## Out of scope guards (do not implement)

- No swatch or icon in the Ticket Detail Dialog.
- No click behavior on swatch or icon; no focusing/controlling agents.
- No agent status for Direct Terminal launches (marker files stay untouched).
- No free-form color input; no color on the column row list in Settings beyond what the form needs.
- No push/subscription updates; polling only.
- No new spec/*.md files and no CONTEXT.md edits (already updated for this ticket).
