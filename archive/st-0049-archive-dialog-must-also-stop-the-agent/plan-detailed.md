# Detailed Plan: Archive dialog must also stop the agent (ST-0049)

This plan implements the PRD in this ticket folder (product-requirement-document.md). The PRD's Implementation Decisions section is the design authority. The plan is sequenced seams first: steps 1-3 create behavior-preserving seams (extracted resolution helper, Herdr control module, check-aggregation module), steps 4-9 build the feature on top of them, steps 10-12 rewrite tests and specs and run the full gate.

Working directory for all changes:
`C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0049-archive-dialog-must-also-stop-the-agent`

All file paths below are relative to that directory unless absolute.

## 1. Project rules the implementer must follow

These come from the repo CLAUDE.md and are binding:

- Be brief. Do not add code comments unless explicitly asked (do not add any in this work).
- Do not add Co-Authored-By lines to commit messages. Never push to remote.
- TypeScript only. Never use bare `slug` as a variable/parameter/property/type-field name; use `projectSlug`, `folderName`, `columnSlug` etc. (see CONTEXT.md glossary; "Herdr Agent", "Herdr Workspace", "Agent Worktree" are glossary terms).
- Prefer `undefined` over `null`; optional fields (`foo?: string`) instead of `foo: string | null`. `null` only where an external API requires it.
- Never swallow errors with empty catch blocks; surface errors to the user. Never add silent fallback defaults for required values.
- Fix bugs at the right depth: generalize shared infrastructure instead of patching callers (this plan already identifies where; do not add extra special cases).
- Do not duplicate code; extract shared helpers.
- Never use `^` or `~` in package.json versions (no new dependencies are needed; `cross-spawn` is already a pinned dependency).
- UI: no z-index / Tailwind `z-*`; dialog stacking stays on the Portal-based `DialogRoot` from `src/components/ui/dialog.tsx`. Do not change button text while running; use disabled state.
- Data access: server functions use `"use server"`, colocated in `*-api.ts` under `src/components/`, import from `src/core/`. Mutations return typed discriminated results (never throw across the wire); reads may throw.
- Tests: run `npm run test` (tsc + eslint + unit) while iterating; the final gate is `npm run test:all` (tsc + eslint + unit + build + testid coverage + e2e). Never skip e2e.
- Any test that launches a terminal/console-host process (powershell, cmd, wt) is a shell test and must be named `*.shell.test.ts`. Nothing in this plan may launch real `herdr` in unit or e2e tests: unit tests inject a fake exec function; e2e overrides the herdr command name with a guaranteed-missing executable.
- e2e tests use the `e2e/real-server.ts` harness via `e2e/fixtures.ts` (`setupE2E`, `createProject`), drive the UI with playwright, and assert real side effects (files on disk, git worktrees/branches). Never stub the app's own server functions; mock only true external boundaries (the Herdr CLI is a true external boundary).
- testid coverage gate (`scripts/testid-coverage.ts`, run in `test:all`): every literal `data-testid="..."` in a src `.tsx` file must be referenced somewhere under `e2e/`. Every new testid introduced below must appear in the new e2e file.
- Spec files in `spec/` are nested plain-English bullet lists: no code, no pseudocode, short sentences, control flow via nesting.
- Do not use underscore or bold markdown formatting in md files; avoid non-ASCII.
- Never use `claude -p` / `claude --print`.

## 2. Target design (from the PRD Implementation Decisions)

- One unified `TicketCleanupDialog` (shared component) replaces the ArchiveTicketDialog / DeleteTicketDialog / WorktreeCleanupDialog split. Used for both archive and delete, for every ticket regardless of `hasAgentWorktree`. Old dialogs, controllers, and their tests are deleted. `project-page-controller` loses the `hasAgentWorktree` branching in `openArchive` / `openDelete`.
- Check-first state model: per cleanup item state machine `{ state: "checking" } | { state: "ready" } | { state: "blocked"; reason: string } | { state: "error"; error: ErrorInfo }`. Items: `stopHerdrAgent`, `deleteWorktree`, `deleteLocalBranch`, `deleteRemoteBranch`. Checks start on dialog open and re-run on every reopen. Checkbox enabled only in "ready".
- One server-side `"use server"` check function `getCleanupStatus(projectSlug, folderName)` in `src/components/ticket/ticket-api.ts` that runs all four checks server-side with Promise.allSettled semantics (one failing check must not hide the others) and returns a typed result per item. The client calls it once per dialog open; all items show "checking" until the single call resolves.
- Check logic reuses `AgentWorktreeManager` predicates (`isWorktreeClean`, `isWorktreeBusy`, `localBranchExists`, `isBranchMerged`, `hasRemoteBranch`) plus fs existence. `WorktreeCleanupService` keeps its submit-time guards (defense in depth).
- New `src/core/launcher/herdr-control.ts` wraps the Herdr CLI via cross-spawn (no shell string interpolation; cross-spawn resolves `herdr.cmd` shims on win32). `findHerdrAgent(projectSlug, folderName)` returns `herdr-missing` | `no-agent` | agent with paneId and agentStatus; `stopHerdrAgent(paneId)` runs `herdr pane close <paneId>`. Lookup mirrors `config-defaults/run-agent-herdr.ps1`: workspace with `label` strictly equal to `projectSlug`, agent with `name` strictly equal to `{projectSlug}--{folderName}` in that workspace. Multiple matching workspaces or agents is an error surfaced to the user.
- Submit pipeline: the cleanup server function accepts `stopHerdrAgent: boolean` and performs stop-agent before `WorktreeCleanupService.cleanup`. Typed error results, never throw from the action path. Archive/delete of the ticket folder remains the final step, skipped when any earlier step fails.
- Persisted options: client-side persistence extended with `stopHerdrAgent` (default true). Effective checked state = persisted preference AND item is "ready".

## 3. Points of resistance in the current code and their resolutions

R1. Three dialogs and branching. `src/components/project/project-page-controller.ts` (openArchive/openDelete, lines ~89-107) branches on `ticket.hasAgentWorktree` between `ArchiveTicketDialog`/`DeleteTicketDialog` and `WorktreeCleanupDialog`; the route `src/routes/project/[projectSlug].tsx` mounts all three.
Resolution: one `TicketCleanupDialog` mounted once; controller always opens it with an action; delete `ArchiveTicketDialog.tsx`, `archive-ticket-controller.ts`, `DeleteTicketDialog.tsx`, `delete-ticket-controller.ts`, `WorktreeCleanupDialog.tsx`, `worktree-cleanup-controller.ts`, `worktree-cleanup-pure.ts` (+ its test) and the three related e2e files, replacing them with the new unified files (steps 6-10). Preserve DeleteTicketDialog's mod+Enter submit (`useModEnterSubmit`) in the unified dialog for both actions.

R2. Agent-worktree location resolution is duplicated and inconsistent. Three places compute worktree path / branch name:
- `AgentWorktreeManager.ensureAgentWorktree` (src/core/worktree/agent-worktree.ts lines ~69-73): uses `launcherConfig.resolveWorktreeSettings` (falls back to the default per-project worktrees dir when `worktreeRootPath` is unset).
- `ProjectPageService.loadProjectPage` (src/core/board/project-page-service.ts lines ~49-54): uses `resolveAgentWorktreeRoot` (same defaulted root) to compute `hasAgentWorktree`.
- `worktreeCleanup` in `src/components/ticket/ticket-api.ts` (lines ~229-261): uses `getMergedConfig(projectSlug).worktreeRootPath` and throws `ValidationError("Worktree root path is not configured")` when unset.
So a worktree created at the defaulted root (which `ensureAgentWorktree` happily does) shows `hasAgentWorktree: true` on the board but cannot be cleaned up unless the user configured a root. With the unified dialog opening for every ticket, this inconsistency would surface constantly.
Resolution (step 1, seam): extract one pure helper `resolveAgentWorktreeLocation` in `src/core/worktree/worktree-naming.ts` and use it in all three call sites plus the new check endpoint. The cleanup server function switches to the defaulted resolution and drops the `ValidationError`; this is the root-cause fix (the callee's contract, not the callers).

R3. Checks only run server-side at submit time inside `WorktreeCleanupService.cleanup` (src/core/worktree/worktree-cleanup.ts) and throw plain Errors. There is no read path that reports per-step applicability.
Resolution (steps 3-4): new check-aggregation module `src/core/worktree/ticket-cleanup-checks.ts` that reuses the same `AgentWorktreeManager` predicates and returns per-item discriminated results, plus a `getCleanupStatus` server function. `WorktreeCleanupService` keeps its guards unchanged (defense in depth), so no logic is duplicated: both paths call the same manager methods.

D3a (recorded decision). `AgentWorktreeManager.isBranchMerged` throws `ValidationError` when the branch does not exist (by design, for the submit guard). The pre-check must report "No local branch" as blocked, not as an error, so the check calls `localBranchExists` first and only calls `isBranchMerged` when the branch exists. No change to the manager contract.

D3b (recorded decision). CLAUDE.md prescribes `query()` + `createAsync` for reads, but this read is dialog-open-scoped and must re-run on every open with fresh results; caching would show stale check results. The repo already has this precedent (`getSyncPending`, `getContext` in ticket-api.ts are plain `"use server"` reads called imperatively). `getCleanupStatus` follows that precedent. It may throw only for whole-request failures (project not found); per-item failures are encoded in the returned items. The client controller catches a thrown/rejected call and maps it to all four items in the "error" state, so nothing is swallowed.

R4. Nothing in the app can talk to the Herdr CLI; the lookup logic lives only in `config-defaults/run-agent-herdr.ps1`.
Resolution (step 2, seam): `src/core/launcher/herdr-control.ts` implementing the same lookup in TypeScript with an injectable exec function. cross-spawn (already a pinned dependency, used by `src/core/launcher/spawn-detached.ts`) resolves win32 `.cmd` shims without shell string interpolation.

R5. e2e determinism: the PRD asserts "Herdr CLI absent in e2e" but the dev machine may have herdr installed, which would make the checkbox show "No Herdr agent" instead of "Herdr is not installed" and could even touch a real Herdr instance.
Resolution: `herdr-control.ts` resolves the executable name from `process.env.CONTEXT_HERDR_COMMAND || "herdr"` (same optional-override pattern as `CONTEXT_LAUNCH_DATA_DIR`, `CONTEXT_PICKER_STUB`). `e2e/fixtures.ts` `createServer` adds `CONTEXT_HERDR_COMMAND: "herdr-e2e-not-installed"` to `safeEnv` so every e2e run deterministically reports herdr-missing without spawning anything real. This mocks a true external boundary via env, consistent with the existing picker/open-in-os stubs, and is not a shell test.

R6. Persisted options JSON (`localStorage` key `worktree-cleanup-options`) predates `stopHerdrAgent`; `loadCleanupOptions` in `src/components/shared/worktree-cleanup-pure.ts` returns the parsed object as-is, so an old stored value would yield `stopHerdrAgent: undefined`.
Resolution (step 6): the new load function spreads parsed values over the defaults object (`stopHerdrAgent: true, deleteWorktree: true, deleteLocalBranch: true, deleteRemoteBranch: false`), keeping the same storage key so existing user preferences survive. This is the PRD-mandated default for a preference, not a silent fallback for a required value.

R7. Two types named `CleanupOptions` exist (client persistence in worktree-cleanup-pure.ts and the valibot-derived type in src/core/worktree/worktree-cleanup.ts). Extending both identically would deepen the confusion.
Resolution: the client persisted type is renamed `TicketCleanupOptions` (4 booleans, includes `stopHerdrAgent`) in the new `ticket-cleanup-pure.ts`. The core `CleanupOptions` (3 booleans) stays unchanged as the input of `WorktreeCleanupService.cleanup`, which remains a pure worktree/git service; Herdr stopping happens in the server function before calling it (PRD decision 6).

R8. testid coverage gate: removing `archive-ticket-*`, `delete-ticket-*`, `worktree-cleanup-*` testids from src while e2e still references them breaks the tests; adding new testids without e2e references breaks the gate. Resolution: step 10 replaces the three e2e dialog files with one `e2e/ticket-cleanup-dialog.test.ts` that references every new testid, in the same change set as the dialog swap.

R9. `handleCleanupSubmit` in project-page-controller only calls the server cleanup when a git option is set. With the new option, the condition must include `stopHerdrAgent`, and the submit order must be: stop Herdr agent, worktree cleanup, then archive/delete (step 8).

## 4. Shared type vocabulary (used by several steps)

Defined in `src/core/worktree/ticket-cleanup-checks.ts` (step 3) and imported with `import type` by client code (type-only imports of core modules from client files are established practice in this repo, e.g. `TicketInfo` from ticket-store):

```ts
export type CleanupItemKey =
  "stopHerdrAgent" | "deleteWorktree" | "deleteLocalBranch" | "deleteRemoteBranch";

export type CleanupCheckItem =
  | { state: "ready" }
  | { state: "blocked"; reason: string }
  | { state: "error"; error: ErrorInfo };

export type TicketCleanupStatus = Record<CleanupItemKey, CleanupCheckItem>;
```

The client-only extension (step 6, ticket-cleanup-pure.ts):

```ts
export type CleanupItemClientState = { state: "checking" } | CleanupCheckItem;
```

Blocked reasons (exact strings, asserted by tests):
- stopHerdrAgent: "Herdr is not installed" (PRD-mandated), "No Herdr agent"
- deleteWorktree: "No worktree", "Worktree has uncommitted changes", "Worktree is in use by another process", and when the Herdr check found an agent: "Worktree is in use by another process (a Herdr agent is running in it)"
- deleteLocalBranch: "No local branch", "Branch has unmerged commits"
- deleteRemoteBranch: "No remote branch"

## 5. Steps

### Step 1 (seam): extract resolveAgentWorktreeLocation and unify the three resolution sites

Files:
- Modify `src/core/worktree/worktree-naming.ts`
- Modify `src/core/worktree/worktree-naming.test.ts`
- Modify `src/core/worktree/agent-worktree.ts`
- Modify `src/core/board/project-page-service.ts`
- Modify `src/components/ticket/ticket-api.ts` (function `worktreeCleanup` only)

What to change and why:

1. Add to `worktree-naming.ts` (pure module, no new imports needed):

```ts
export interface AgentWorktreeLocation {
	worktreePath: string;
	branchName: string;
}

export function resolveAgentWorktreeLocation(
	ticketFolderName: string,
	settings: { worktreeRootPath: string; branchPrefix?: string },
	saved?: { savedWorktreePath?: string; savedBranchName?: string },
): AgentWorktreeLocation {
	return {
		worktreePath: saved?.savedWorktreePath
			?? `${settings.worktreeRootPath}/${worktreeFolderName(ticketFolderName)}`,
		branchName: saved?.savedBranchName
			?? worktreeBranchName(ticketFolderName, settings.branchPrefix),
	};
}
```

Path and branch resolve independently (matches the current `??` pairs in ticket-api and project-page-service; `SavedWorktreeInfo` in ensureAgentWorktree always carries both, so it is equivalent there). Keep the tab indentation used in `src/core`.

2. `agent-worktree.ts` `ensureAgentWorktree`: replace the two lines computing `branchName` and `worktreePath` (currently `savedWorktreeInfo?.branchName ?? worktreeBranchName(...)` and `savedWorktreeInfo?.agentWorktreePath ?? ...`) with a call to `resolveAgentWorktreeLocation(folderName, { worktreeRootPath, branchPrefix }, savedWorktreeInfo && { savedWorktreePath: savedWorktreeInfo.agentWorktreePath, savedBranchName: savedWorktreeInfo.branchName })`.

3. `project-page-service.ts`: replace the manual `wtPath` computation in the ticket loop with `resolveAgentWorktreeLocation(ticket.folderName, this.launcherConfigManager.resolveWorktreeSettings(projectSlug), { savedWorktreePath: ticket.agentWorktreeDir }).worktreePath`. Hoist the `resolveWorktreeSettings` call out of the loop (replacing the existing `resolveAgentWorktreeRoot` call). Forward-slash joining replaces `path.join`; `fs.existsSync` accepts both separators, and this now matches what `ensureAgentWorktree` records.

4. `ticket-api.ts` `worktreeCleanup`: replace the `getMergedConfig` + `ValidationError("Worktree root path is not configured")` + manual `worktreePath`/`resolvedBranchName` block with:

```ts
const ticket = store.getTicket(folderName);
const { worktreePath, branchName } = resolveAgentWorktreeLocation(
  folderName,
  launcherConfigManager.resolveWorktreeSettings(projectSlug),
  { savedWorktreePath: ticket?.agentWorktreeDir, savedBranchName: ticket?.agentWorktreeBranchName },
);
```

and pass `branchName`/`worktreePath` to `WorktreeCleanupService.cleanup` as before. Remove the now-unused `ValidationError` import if nothing else in the file uses it (check: `createTicket` etc. do not; only `worktreeCleanup` used it). This intentionally changes behavior for projects without a configured `worktreeRootPath`: cleanup now targets the same defaulted root where `ensureAgentWorktree` creates worktrees and where the board detects them, instead of erroring (R2).

5. Unit tests in `worktree-naming.test.ts`: cover computed path/branch with and without branchPrefix, saved path only, saved branch only, both saved, long folder-name truncation flowing through `worktreeFolderName`.

Acceptance criteria:
- `npm run test` passes (tsc, eslint, all unit tests including `agent-worktree.test.ts`, `worktree-cleanup.test.ts`, `project-page-service.test.ts` unchanged).
- No remaining direct computation of `worktreeRootPath + "/" + worktreeFolderName(...)` outside `resolveAgentWorktreeLocation` (grep for `worktreeFolderName(` shows only worktree-naming.ts, its test, and call sites passing through the helper... note `agent-launch.ts` or others that legitimately use `worktreeFolderName` for other purposes may remain; the criterion is that the path-plus-branch pair resolution exists once).
- `worktreeCleanup` no longer throws "Worktree root path is not configured".

### Step 2 (seam): Herdr control module

Files:
- Create `src/core/launcher/herdr-control.ts`
- Create `src/core/launcher/herdr-control.test.ts`

What to build:

```ts
import spawn from "cross-spawn";
import { ProcessError } from "../shared/errors.js";

export type HerdrExecFn = (commandArgs: string[]) => Promise<string>;

export type FindHerdrAgentResult =
	| { kind: "herdr-missing" }
	| { kind: "no-agent" }
	| { kind: "agent"; paneId: string; agentStatus: string };
```

- `herdrCommand()` (private): `process.env.CONTEXT_HERDR_COMMAND || "herdr"`.
- `execHerdr(commandArgs)` (exported as the default `HerdrExecFn`): spawn via cross-spawn with `stdio: ["ignore", "pipe", "pipe"]`, collect stdout/stderr, resolve stdout on exit code 0; on nonzero exit reject with `ProcessError("herdr " + commandArgs.join(" "), exitCode, combined output)`; on spawn `error` event reject with that error (cross-spawn surfaces ENOENT there). Timeout is not needed for `list`/`close` commands, but a 30000 ms kill timer matching `git()` in `src/core/infra/git.ts` is acceptable and preferred for parity.
- `findHerdrAgent(projectSlug: string, folderName: string, exec: HerdrExecFn = execHerdr): Promise<FindHerdrAgentResult>`:
  - run `exec(["workspace", "list"])`; if it rejects with an error whose `code === "ENOENT"`, return `{ kind: "herdr-missing" }`; any other rejection propagates.
  - `JSON.parse` the output; workspaces are at `result.workspaces` (array of objects with `workspace_id` and optional `label`), matching the shapes in `src/core/launcher/run-agent-herdr.shell.test.ts`. Malformed JSON or a missing `result.workspaces` array must throw an Error naming the herdr command that produced it (never a silent default).
  - filter workspaces where `label` is strictly equal to `projectSlug` (case-sensitive, mirroring the ps1 `-ceq`). More than one match: `throw new Error("Multiple Herdr workspaces are labeled '" + projectSlug + "'. Rename or close duplicates first.")`. Zero: return `{ kind: "no-agent" }`.
  - run `exec(["agent", "list"])`; agents at `result.agents` with fields `workspace_id`, `pane_id`, `name`, `agent_status`. Filter `workspace_id === matchedWorkspaceId && name === projectSlug + "--" + folderName`. More than one: throw `"Ticket '" + folderName + "' has multiple Herdr agents (" + statuses.join(", ") + "). Close duplicates first."`. Zero: `{ kind: "no-agent" }`.
  - exactly one: if it has no `pane_id`, throw `"Herdr agent for ticket '" + folderName + "' has no pane id."`; else return `{ kind: "agent", paneId, agentStatus }` (any status counts, per the PRD).
- `stopHerdrAgent(paneId: string, exec: HerdrExecFn = execHerdr): Promise<void>`: `await exec(["pane", "close", paneId])`.

Note: the agent name uses the full ticket `folderName` (the ps1 derives it from the marker filename written by `agentMarkerPath(projectSlug, folderName)` in `src/core/launcher/agent-launch.ts`), not the truncated `worktreeFolderName`.

Unit tests (`herdr-control.test.ts`, injected exec only, never real herdr):
- exec rejecting with `Object.assign(new Error("spawn herdr ENOENT"), { code: "ENOENT" })` yields `{ kind: "herdr-missing" }`.
- empty workspaces array yields no-agent without calling `agent list` (track calls on the fake).
- workspace matched, empty agents yields no-agent.
- agent matched yields paneId and agentStatus.
- workspace label match is case-sensitive; agent in a different workspace_id is ignored.
- two matching workspaces rejects with the duplicates message; two matching agents rejects with the multiple-agents message.
- nonzero-exit `ProcessError` from exec propagates (rejects).
- malformed JSON rejects.
- `stopHerdrAgent` invokes exec with `["pane", "close", "<paneId>"]` and propagates exec failure.

Acceptance criteria:
- `npm run test` passes; new tests cover all branches above; no test spawns a real process.

### Step 3 (seam): check-aggregation module

Files:
- Create `src/core/worktree/ticket-cleanup-checks.ts`
- Create `src/core/worktree/ticket-cleanup-checks.test.ts`

What to build: the types from section 4 plus:

```ts
export interface TicketCleanupCheckTarget {
	projectSlug: string;
	folderName: string;
	projectPath: string;
	worktreePath: string;
	branchName: string;
	configuredMainBranch?: string;
}

export interface TicketCleanupCheckDeps {
	worktreeExists(worktreePath: string): boolean;
	isWorktreeClean(worktreePath: string): Promise<boolean>;
	isWorktreeBusy(worktreePath: string): Promise<boolean>;
	localBranchExists(projectPath: string, branchName: string): Promise<boolean>;
	isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean>;
	hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean>;
	findHerdrAgent(projectSlug: string, folderName: string): Promise<FindHerdrAgentResult>;
}

export async function runTicketCleanupChecks(
	target: TicketCleanupCheckTarget,
	deps: TicketCleanupCheckDeps,
): Promise<TicketCleanupStatus>
```

Deps contains only functions and target only data (data/behavior separation rule). Implementation:

- Each of the four checks is an async function returning `CleanupCheckItem`; each wraps its own body in try/catch and converts a thrown error to `{ state: "error", error: errorPayload(e) }` (`errorPayload` from `src/core/shared/errors.ts` preserves command/output for `ProcessError`). Because every check catches internally, `Promise.all` over the four gives the required allSettled semantics: one failing check cannot hide the others.
- stopHerdrAgent check: `findHerdrAgent`; herdr-missing -> blocked "Herdr is not installed"; no-agent -> blocked "No Herdr agent"; agent -> ready. Thrown errors (duplicates, CLI failure) -> error state via the shared wrapper.
- deleteWorktree check: takes the stop-herdr check promise as an argument so it can run after it (PRD acceptance note). Logic: `!worktreeExists` -> blocked "No worktree"; `!isWorktreeClean` -> blocked "Worktree has uncommitted changes"; `isWorktreeBusy` -> await the herdr item, and if it is `{ state: "ready" }` (an agent exists) the reason is "Worktree is in use by another process (a Herdr agent is running in it)", otherwise "Worktree is in use by another process"; else ready.
- deleteLocalBranch check: `!localBranchExists` -> blocked "No local branch"; `!isBranchMerged(projectPath, branchName, configuredMainBranch)` -> blocked "Branch has unmerged commits"; else ready. (`localBranchExists` first, so `isBranchMerged`'s missing-branch `ValidationError` is never triggered by the check path; see D3a.)
- deleteRemoteBranch check: `!hasRemoteBranch` -> blocked "No remote branch"; else ready.
- Kick off the stop-herdr promise first, then `Promise.all([herdrItemPromise, worktreeCheck(herdrItemPromise), localBranchCheck(), remoteBranchCheck()])`, assemble the record.

Unit tests (`ticket-cleanup-checks.test.ts`, fake deps only):
- all ready when every predicate is favorable and an agent exists.
- each blocked reason (exact strings from section 4).
- busy worktree with agent present vs absent vs herdr errored: reason with and without the parenthetical.
- a rejecting `isBranchMerged` produces `deleteLocalBranch` in error state with the message in `error.description`, while the other three items still resolve (allSettled semantics).
- `findHerdrAgent` throwing (duplicates) produces `stopHerdrAgent` error state and does not corrupt the deleteWorktree result.
- missing local branch does not call `isBranchMerged` (track calls).

Acceptance criteria: `npm run test` passes; the module imports nothing from components; reasons match section 4 exactly.

### Step 4: getCleanupStatus server function

Files:
- Modify `src/components/ticket/ticket-api.ts`

What to change:

Add (colocated next to `worktreeCleanup`):

```ts
export async function getCleanupStatus(
  projectSlug: string, folderName: string,
): Promise<TicketCleanupStatus> {
  "use server";
  const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug);
  if (!project) throw new NotFoundError("Project not found");
  const ticketWorktreeDir = worktreeManager.getWorktreeDir(projectSlug);
  const ticket = new TicketStore(ticketWorktreeDir).getTicket(folderName);
  const { worktreePath, branchName } = resolveAgentWorktreeLocation(
    folderName,
    launcherConfigManager.resolveWorktreeSettings(projectSlug),
    { savedWorktreePath: ticket?.agentWorktreeDir ?? undefined,
      savedBranchName: ticket?.agentWorktreeBranchName ?? undefined },
  );
  return runTicketCleanupChecks(
    {
      projectSlug, folderName, projectPath: project.path,
      worktreePath, branchName, configuredMainBranch: project.mainBranch,
    },
    {
      worktreeExists: (p) => fs.existsSync(p),
      isWorktreeClean: (p) => agentWorktreeManager.isWorktreeClean(p),
      isWorktreeBusy: (p) => agentWorktreeManager.isWorktreeBusy(p),
      localBranchExists: (pp, b) => agentWorktreeManager.localBranchExists(pp, b),
      isBranchMerged: (pp, b, m) => agentWorktreeManager.isBranchMerged(pp, b, m),
      hasRemoteBranch: (pp, b) => agentWorktreeManager.hasRemoteBranch(pp, b),
      findHerdrAgent,
    },
  );
}
```

(`getTicket` returns `TicketInfo | null` from the store; convert `null` field access with `?? undefined` as shown to honor the prefer-undefined rule at the boundary. Import `fs` from "fs", `findHerdrAgent` from `~/core/launcher/herdr-control.js`, `runTicketCleanupChecks` and the types from `~/core/worktree/ticket-cleanup-checks.js`, `resolveAgentWorktreeLocation` from `~/core/worktree/worktree-naming.js` — the latter already imported after step 1.)

Why here: PRD decision 3 names ticket-api.ts; it keeps both cleanup server functions (check + submit) in one file, and the file already imports the needed instances from `~/core/config/instances.js`.

Acceptance criteria: `npm run test` passes (tsc + eslint). Behavior is exercised in steps 7-10 tests.

### Step 5: extend the submit pipeline (server)

Files:
- Modify `src/components/ticket/ticket-api.ts` (function `worktreeCleanup`)

What to change:

- Widen the options parameter to `{ stopHerdrAgent: boolean; deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean }`.
- Inside the existing try block, before constructing/calling `WorktreeCleanupService`:

```ts
if (options.stopHerdrAgent) {
  const found = await findHerdrAgent(projectSlug, folderName);
  if (found.kind === "herdr-missing") {
    throw new ValidationError("Herdr is not installed or is not available on PATH.");
  }
  if (found.kind === "no-agent") {
    throw new ValidationError(`No Herdr agent found for ticket '${folderName}'.`);
  }
  await stopHerdrAgent(found.paneId);
}
```

  (re-add the `ValidationError` import if it was removed in step 1). Then call `WorktreeCleanupService.cleanup` with the three git options as today. The existing catch block already converts any throw into the typed `{ ok: false, type: "error", message, errorInfo }` result, so the action path still never throws (PRD decision 6). A failed stop therefore aborts the whole submit and the ticket is not archived/deleted (the archive/delete call happens client-side only after an ok result).
- Do not change `WorktreeCleanupService` or the core `CleanupOptions` valibot schema (R7): stopping a Herdr Agent is launcher-domain work performed by the server function, and the service keeps its single worktree/git responsibility.

Acceptance criteria: `npm run test` passes; `src/core/worktree/worktree-cleanup.test.ts` is untouched and green.

### Step 6: client pure module (persisted options and state helpers)

Files:
- Create `src/components/shared/ticket-cleanup-pure.ts`
- Create `src/components/shared/ticket-cleanup-pure.test.ts`
- Delete `src/components/shared/worktree-cleanup-pure.ts`
- Delete `src/components/shared/worktree-cleanup-pure.test.ts`

(The deletions land in the same change as step 8/9 removing their importers; if implementing strictly stepwise, create the new files here and delete the old ones in step 9.)

Contents of `ticket-cleanup-pure.ts`:

```ts
import type { ErrorInfo } from "~/core/shared/errors.js";
import type {
  CleanupCheckItem, CleanupItemKey, TicketCleanupStatus,
} from "~/core/worktree/ticket-cleanup-checks.js";

export interface TicketCleanupOptions {
  stopHerdrAgent: boolean;
  deleteWorktree: boolean;
  deleteLocalBranch: boolean;
  deleteRemoteBranch: boolean;
}

export type CleanupItemClientState = { state: "checking" } | CleanupCheckItem;
export type TicketCleanupItemStates = Record<CleanupItemKey, CleanupItemClientState>;

export const CLEANUP_ITEM_KEYS: CleanupItemKey[] = [
  "stopHerdrAgent", "deleteWorktree", "deleteLocalBranch", "deleteRemoteBranch",
];

const STORAGE_KEY = "worktree-cleanup-options";
const DEFAULT_OPTIONS: TicketCleanupOptions = {
  stopHerdrAgent: true, deleteWorktree: true, deleteLocalBranch: true, deleteRemoteBranch: false,
};
```

- `loadCleanupOptions(): TicketCleanupOptions` — same try/catch shape as the old module (the catch comment may be kept as-is since it exists today; do not add new comments), but returns `{ ...DEFAULT_OPTIONS, ...JSON.parse(raw) }` so old 3-field persisted values gain `stopHerdrAgent: true` (R6). Keep the storage key unchanged.
- `saveCleanupOptions(options: TicketCleanupOptions): void` — unchanged semantics.
- `toErrorInfo(value: string | ErrorInfo): ErrorInfo` — carried over verbatim.
- `allChecking(): TicketCleanupItemStates` — record with every key `{ state: "checking" }`.
- `allError(error: ErrorInfo): TicketCleanupItemStates` — record with every key `{ state: "error", error }` (used when the whole getCleanupStatus call rejects; D3b).
- `effectiveCleanupOptions(options: TicketCleanupOptions, items: TicketCleanupItemStates): TicketCleanupOptions` — each key: `options[key] && items[key].state === "ready"` (PRD decision 7: effective checked = preference AND ready).

Tests (`ticket-cleanup-pure.test.ts`, mirrors the old pure test structure with `localStorage.clear()` in beforeEach):
- defaults when storage empty (including `stopHerdrAgent: true`).
- stored 4-field values round-trip.
- legacy 3-field stored value gains `stopHerdrAgent: true` while keeping the stored three.
- invalid JSON falls back to defaults.
- `toErrorInfo` string and object cases.
- `effectiveCleanupOptions`: checked+ready true; checked+blocked false; checked+checking false; unchecked+ready false.
- `allChecking` / `allError` produce all four keys.

Acceptance criteria: `npm run test` passes with the new test file.

### Step 7: dialog controller with the check-first state machine

Files:
- Create `src/components/shared/ticket-cleanup-controller.ts`
- Create `src/components/shared/ticket-cleanup-controller.test.ts`
- Delete `src/components/shared/worktree-cleanup-controller.ts` (with step 9)

Contents:

```ts
export interface TicketCleanupDeps {
  projectSlug: () => string;
  ticket: () => TicketInfo | null;
  action: () => "archive" | "delete";
  loadStatus: (projectSlug: string, folderName: string) => Promise<TicketCleanupStatus>;
  onSubmit: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  onOpenChange: (open: boolean) => void;
}

export function createTicketCleanupController(deps: TicketCleanupDeps) { ... }
export type TicketCleanupController = ReturnType<typeof createTicketCleanupController>;
```

State signals: `items: TicketCleanupItemStates` (initial `allChecking()`), `options: TicketCleanupOptions` (initial `loadCleanupOptions()`), `submitting: boolean`, `errorInfo: ErrorInfo | null` (null retained here only because the existing dialog controllers use it with `<Show>`; follow the existing worktree-cleanup-controller convention).

Behavior:
- `startChecks(): Promise<void>` — reads the current ticket; if none, returns. Increments a local request token, sets `errorInfo` null and `items` to `allChecking()`, then awaits `deps.loadStatus(deps.projectSlug(), ticket.folderName)`. On resolve, if the token is still current, set `items` to the four returned entries. On reject, if current, set `items` to `allError(toErrorInfo(message))` — errors surface per item, never swallowed. Stale responses (dialog reopened for a different ticket meanwhile) are ignored via the token.
- `isChecked(key)` — `options()[key] && items()[key].state === "ready"`.
- `updateOption(key, value)` — new options object (immutability rule: replace, never mutate), `saveCleanupOptions`.
- `actionLabel()` — "Archive" / "Delete".
- `doSubmit()` — guard on ticket and `submitting()`; set submitting, clear errorInfo; `const result = await deps.onSubmit(ticket.folderName, effectiveCleanupOptions(options(), items()))`; on `result?.error` set `errorInfo` via `toErrorInfo`, else `close()`; catch sets errorInfo from the thrown message; finally clears submitting. (Same shape as the current worktree-cleanup-controller `handleSubmit`, plus effective-option computation.)
- `handleSubmit(e: SubmitEvent)` — preventDefault + `doSubmit()` (form usage); `doSubmit` also serves `useModEnterSubmit`.
- `close()` — `onOpenChange(false)`, clear errorInfo.
- Return `{ items, options, isChecked, submitting, errorInfo, actionLabel, updateOption, startChecks, doSubmit, handleSubmit, close }`.

Tests (`ticket-cleanup-controller.test.ts`, `createRoot` pattern as in `create-ticket-controller.test.ts`, fake deps, controlled promises):
- after `startChecks` begins (loadStatus pending), all four items are "checking".
- when loadStatus resolves, items reflect the returned states; a ready item with persisted preference true reports `isChecked` true; a blocked item reports false even when the preference is true.
- loadStatus rejection puts all items in "error" with the message (nothing swallowed).
- stale response ignored: start checks for ticket A, start again for ticket B, resolve A's promise after B's — items show B's result.
- `updateOption` persists to localStorage and flips `isChecked` for a ready item.
- `doSubmit` passes effective options (checked-but-blocked keys become false; checking keys become false).
- `doSubmit` surfaces `{ error }` results in `errorInfo` and keeps the dialog open (onOpenChange not called with false).
- successful submit closes the dialog.
- `submitting` is true during an in-flight submit and false after.

Acceptance criteria: `npm run test` passes; the controller module imports nothing from `*.tsx`.

### Step 8: project-page-controller loses the branching; submit pipeline client side

Files:
- Modify `src/components/project/project-page-controller.ts`

What to change:
- Remove signals `deleteTicketOpen`, `archiveTicketOpen` and their entries in `dialogState`; remove `setDeleteTicketOpen`, `setArchiveTicketOpen` from `commands`.
- `openDelete(ticket)` / `openArchive(ticket)`: unconditionally `setSelectedTicket(ticket); setCleanupAction("delete" | "archive"); setCleanupDialogOpen(true);` (no `hasAgentWorktree` branching — PRD decision 1).
- `handleArchiveTicket` / `handleDeleteTicket`: keep as private functions used by `handleCleanupSubmit`; remove them from the exported `commands` object (their only external consumers were the deleted dialogs).
- `handleCleanupSubmit(folderName, options: TicketCleanupOptions)`:

```ts
if (options.stopHerdrAgent || options.deleteWorktree
    || options.deleteLocalBranch || options.deleteRemoteBranch) {
  const cleanupResult = await worktreeCleanup(deps.projectSlug(), folderName, options);
  if (!cleanupResult.ok) {
    const info = 'errorInfo' in cleanupResult ? cleanupResult.errorInfo : undefined;
    return { error: info ?? cleanupResult.message };
  }
}
return cleanupAction() === "archive"
  ? await handleArchiveTicket(folderName)
  : await handleDeleteTicket(folderName);
```

  Import `TicketCleanupOptions` from `../shared/ticket-cleanup-pure.js` for the signature. Server-side ordering (stop agent, then worktree, then branches) is inside `worktreeCleanup`; archive/delete stays last and is skipped on error (R9, PRD acceptance).

Acceptance criteria: tsc/eslint pass once step 9 updates the route; the archive/delete flow still revalidates "project-page" on success (unchanged inner functions).

### Step 9: unified TicketCleanupDialog, route wiring, deletions

Files:
- Create `src/components/shared/TicketCleanupDialog.tsx`
- Modify `src/routes/project/[projectSlug].tsx`
- Delete `src/components/ticket/ArchiveTicketDialog.tsx`
- Delete `src/components/ticket/archive-ticket-controller.ts`
- Delete `src/components/ticket/DeleteTicketDialog.tsx`
- Delete `src/components/ticket/delete-ticket-controller.ts`
- Delete `src/components/shared/WorktreeCleanupDialog.tsx`
- Delete `src/components/shared/worktree-cleanup-controller.ts`
- Delete `src/components/shared/worktree-cleanup-pure.ts` and `src/components/shared/worktree-cleanup-pure.test.ts` (if not already removed in step 6)

TicketCleanupDialog.tsx:

- Props:

```ts
interface TicketCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  ticket: TicketInfo | null;
  action: "archive" | "delete";
  onSubmit: (
    folderName: string, cleanup: TicketCleanupOptions,
  ) => Promise<{ error?: string | ErrorInfo }>;
  ctrl?: TicketCleanupController;
}
```

- Default controller construction mirrors the old dialogs: `props.ctrl ?? createTicketCleanupController({ projectSlug: () => props.projectSlug, ticket: () => props.ticket, action: () => props.action, loadStatus: getCleanupStatus, onSubmit: props.onSubmit, onOpenChange: props.onOpenChange })` with `getCleanupStatus` imported from `~/components/ticket/ticket-api.js`.
- `createEffect(() => { if (props.open && props.ticket) void s.startChecks(); })` — runs on every open (and when the ticket changes while open), satisfying "checks start when the dialog opens and re-run on reopen".
- `useModEnterSubmit({ onSubmit: () => void s.doSubmit(), disabled: () => s.submitting(), active: () => props.open && !!props.ticket })` — preserves DeleteTicketDialog's shortcut, now for both actions (R1).
- Layout: `DialogRoot open={props.open && !!props.ticket} onOpenChange={s.close}`; `DialogTitle` "{Archive|Delete} Ticket"; `DialogDescription` "{Action} ticket {number} - {title}?" (same as today).
- Cleanup section: a local row list (single source, no per-row copy-paste):

```ts
const rows: {
  key: CleanupItemKey; label: string; checkboxTestId: string; statusTestId: string;
}[] = [
  { key: "stopHerdrAgent", label: "Stop the Herdr agent",
    checkboxTestId: "ticket-cleanup-stop-herdr-checkbox",
    statusTestId: "ticket-cleanup-stop-herdr-status" },
  { key: "deleteWorktree", label: "Delete worktree",
    checkboxTestId: "ticket-cleanup-delete-worktree-checkbox",
    statusTestId: "ticket-cleanup-delete-worktree-status" },
  { key: "deleteLocalBranch", label: "Delete local branch",
    checkboxTestId: "ticket-cleanup-delete-local-checkbox",
    statusTestId: "ticket-cleanup-delete-local-status" },
  { key: "deleteRemoteBranch", label: "Delete remote branch",
    checkboxTestId: "ticket-cleanup-delete-remote-checkbox",
    statusTestId: "ticket-cleanup-delete-remote-status" },
];
```

  Rendered with `<For>`: each row is a label with a checkbox `checked={s.isChecked(row.key)}`, `disabled={s.items()[row.key].state !== "ready"}`, `onChange` calling `s.updateOption(row.key, e.currentTarget.checked)`, `data-testid={row.checkboxTestId}`; next to it a status span `data-testid={row.statusTestId}` `data-state={s.items()[row.key].state}` rendering by state: checking -> muted "Checking..." (a subtle `animate-pulse` class is fine; no spinner component exists and none is required); ready -> empty; blocked -> muted `reason`; error -> destructive `error.description`. UI order is submit order: stop Herdr agent first.
- Submit error block: carry over the `errorInfo` block from WorktreeCleanupDialog verbatim (description, optional command, optional output).
- Footer form: Cancel button `data-testid="ticket-cleanup-cancel"`; submit button `data-testid="ticket-cleanup-submit"`, `disabled={s.submitting()}` only (stays enabled while checks run, per acceptance criteria), class `btn-destructive` for delete / `btn-primary` for archive, `title={modEnterHint()}`, static label `{s.actionLabel()}` (no text change while running).

Route changes in `[projectSlug].tsx`:
- Remove the `DeleteTicketDialog`, `ArchiveTicketDialog`, `WorktreeCleanupDialog` imports and JSX blocks.
- Add `TicketCleanupDialog` (import from `~/components/shared/TicketCleanupDialog`):

```tsx
<TicketCleanupDialog
  open={dialogState().cleanupDialogOpen}
  onOpenChange={commands.setCleanupDialogOpen}
  projectSlug={d().projectSlug}
  ticket={selectionState().selectedTicket}
  action={dialogState().cleanupAction}
  onSubmit={commands.handleCleanupSubmit}
/>
```

Acceptance criteria:
- `npm run test` passes (tsc catches any missed reference to deleted modules; grep for `ArchiveTicketDialog|DeleteTicketDialog|WorktreeCleanupDialog|worktree-cleanup-controller|worktree-cleanup-pure|archive-ticket-controller|delete-ticket-controller` returns no src hits).
- `npm run dev` manual check: archive and delete menu items on any ticket open the unified dialog; a ticket without a worktree shows all four checkboxes disabled with reasons after the checks resolve and can still be archived/deleted; submit button never changes text.

### Step 10: e2e tests and fixtures

Files:
- Modify `e2e/fixtures.ts`
- Create `e2e/ticket-cleanup-dialog.test.ts`
- Delete `e2e/archive-ticket-dialog.test.ts`
- Delete `e2e/delete-ticket-dialog.test.ts`
- Delete `e2e/worktree-cleanup-dialog.test.ts`

fixtures.ts: in `createServer`, extend `safeEnv` with `CONTEXT_HERDR_COMMAND: "herdr-e2e-not-installed"` (before spreading `opts.env`, so a future test could override). This guarantees the Herdr check reports herdr-missing on every machine, including machines where herdr is installed (R5), without spawning anything.

`e2e/ticket-cleanup-dialog.test.ts` ("TicketCleanupDialog (e2e, real server)", `setupE2E`, same helpers as the deleted files: `createProject`, `uniqueSlug`, `gotoProject`, `clickTicketMenuItem`, `listTicketFolders`, `worktreeExists`). Helper `openCleanup(item: "archive" | "delete")` clicks the ticket menu item and waits for `[data-testid="ticket-cleanup-submit"]`. Helper `waitForChecksSettled(page)` polls until no status element has `data-state="checking"`. Tests (each with the 60000 timeout convention):

1. Archive without worktree: seed one ticket, open archive; after checks settle assert all four checkboxes disabled and unchecked; assert `ticket-cleanup-stop-herdr-status` has `data-state="blocked"` and text "Herdr is not installed" (PRD-mandated assertion); assert `ticket-cleanup-delete-worktree-status` text "No worktree"; click submit; assert the ticket folder moved to `.../tickets/archive/<folderName>` on disk and the board shows zero cards (covers the old archive-ticket-dialog.test.ts assertions).
2. Delete without worktree, cancel then submit: cancel keeps the folder on disk (dialog detaches); reopen, submit removes the folder (covers the old delete-ticket-dialog.test.ts).
3. Check-progress and enablement with a worktree: seed `withWorktrees: [{ folderName }]`, open delete; assert every status element exists with a `data-state` attribute immediately after open, then settles to a terminal state (the transient "checking" rendering itself is deterministically covered by the controller unit tests; e2e asserts presence plus terminal states to avoid timing flake); assert `ticket-cleanup-delete-worktree-checkbox` and `ticket-cleanup-delete-local-checkbox` become enabled (fresh branch is merged by ancestry) and `ticket-cleanup-delete-remote-checkbox` stays disabled ("No remote branch"); check delete-worktree, submit; assert the worktree is gone from disk and the ticket folder is deleted (covers the old worktree-cleanup submit test).
4. Cleanup dialog opens on archive when a worktree exists but `useWorktree` is false (regression from the old suite): create the worktree manually at the default root (same git commands as the old test), open archive, verify the dialog opens and the delete-worktree checkbox becomes enabled; cancel; worktree still on disk.
5. Worktree folder that is not a valid git repo (regression): seed worktree, remove its `.git` file, open delete, check delete-worktree once enabled, submit; worktree removed from disk (relies on `isWorktreeClean` treating non-git as clean, unchanged behavior).
6. Preference persistence: with a worktree ticket, uncheck delete-local-branch, cancel, reopen; the checkbox is still unchecked while delete-worktree remains checked (localStorage round-trip through the real UI).

Every literal testid introduced in step 9 (`ticket-cleanup-cancel`, `ticket-cleanup-submit`) and every row testid must be referenced in this file so the testid coverage gate passes and the dynamic ones are genuinely exercised (R8).

Acceptance criteria:
- `npm run test:e2e` passes.
- `npm run test:gate` passes (no src testid without an e2e reference; in particular the removed `archive-ticket-*`, `delete-ticket-*`, `worktree-cleanup-*` ids no longer exist in src).

### Step 11: spec update

Files:
- Modify `spec/archive-ticket.md`

Rewrite in the established style (nested plain-English bullets, no code), describing: menu Archive or Delete always opens the ticket cleanup dialog; the four cleanup items; checks start in parallel on open with a visible checking indicator per item; a possible step enables its checkbox with the persisted checked state; an impossible step stays disabled and unchecked with the reason; a failed check shows the error next to the item; submit stays enabled while checks run; submit runs the selected steps in order (stop Herdr agent, delete worktree, delete local branch, delete remote branch); any failure shows the error and stops without archiving/deleting; then the existing archive tail (create archive directory if missing, destination-exists error, move folder, remove from order store, archived tickets excluded from the board) and the delete counterpart (remove the ticket folder). Keep sentences short; represent control flow with nesting.

Acceptance criteria: the spec matches the implemented behavior; no code or pseudocode in the file; no bold/underscore formatting.

### Step 12: full verification

Commands (from the repo root):
- `npm run test:all` — tsc, eslint, unit (including all new tests), build, testid coverage gate, e2e. Everything must pass; there cannot be any pre-existing or leftover failures.
- Do not run `npm run test:shell` (shell tests only on explicit user request; nothing in this change requires them — `run-agent-herdr.shell.test.ts` is untouched).

Manual smoke (optional but recommended, via `npm run dev`): open archive on a ticket with a running Herdr agent on a machine with herdr installed; verify the stop checkbox becomes enabled, the busy reason mentions the running agent, and submitting stops the agent, cleans the worktree, and archives the ticket.

## 6. Deleted-file checklist (final state)

Gone: `src/components/ticket/ArchiveTicketDialog.tsx`, `src/components/ticket/archive-ticket-controller.ts`, `src/components/ticket/DeleteTicketDialog.tsx`, `src/components/ticket/delete-ticket-controller.ts`, `src/components/shared/WorktreeCleanupDialog.tsx`, `src/components/shared/worktree-cleanup-controller.ts`, `src/components/shared/worktree-cleanup-pure.ts`, `src/components/shared/worktree-cleanup-pure.test.ts`, `e2e/archive-ticket-dialog.test.ts`, `e2e/delete-ticket-dialog.test.ts`, `e2e/worktree-cleanup-dialog.test.ts`.

New: `src/core/launcher/herdr-control.ts` (+test), `src/core/worktree/ticket-cleanup-checks.ts` (+test), `src/components/shared/TicketCleanupDialog.tsx`, `src/components/shared/ticket-cleanup-controller.ts` (+test), `src/components/shared/ticket-cleanup-pure.ts` (+test), `e2e/ticket-cleanup-dialog.test.ts`.

Modified: `src/core/worktree/worktree-naming.ts` (+test), `src/core/worktree/agent-worktree.ts`, `src/core/board/project-page-service.ts`, `src/components/ticket/ticket-api.ts`, `src/components/project/project-page-controller.ts`, `src/routes/project/[projectSlug].tsx`, `e2e/fixtures.ts`, `spec/archive-ticket.md`.

Unchanged on purpose: `src/core/worktree/worktree-cleanup.ts` (`WorktreeCleanupService`, its `CleanupOptions` schema and submit-time guards), `src/components/ticket/form-dialog-controller.ts` (still used by create/edit dialogs), `config-defaults/run-agent-herdr.ps1`, all `*.shell.test.ts`.
