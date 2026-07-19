# PRD: Archive dialog must also stop the agent (ST-0049)

## Background

Archiving (or deleting) a ticket today goes through two dialogs:

- ArchiveTicketDialog (src/components/ticket/ArchiveTicketDialog.tsx): plain confirm, used when the ticket has no agent worktree.
- WorktreeCleanupDialog (src/components/shared/WorktreeCleanupDialog.tsx): three static checkboxes (delete worktree, delete local branch, delete remote branch), used for both archive and delete when the ticket has an agent worktree. Checkbox state persists in localStorage. Checks (worktree clean/busy, branch merged, remote exists) only run server-side at submit time inside WorktreeCleanupService, so the user learns a step is impossible only after clicking Archive.

A ticket's agent may be running as a Herdr Agent (a coding-agent session in the project's Herdr Workspace, named `{projectSlug}--{folderName}`). The launch script config-defaults/run-agent-herdr.ps1 already checks for such an agent via the Herdr CLI (`herdr agent list`, filtered by workspace label = projectSlug and agent name). Nothing in the app can stop that agent; the user must close it manually before worktree cleanup can succeed (the worktree is busy while the agent runs in it).

## Requirements

1. The archive/delete cleanup dialog gets a new checkbox: "Stop the Herdr agent". It is a small feature: check whether a Herdr Agent exists for this ticket (the check command already exists in the Herdr CLI: `herdr agent list`), and if the user leaves the checkbox checked, stop that agent during submit.
2. Refactor the dialog workflow: when the dialog opens, immediately start an applicability check for every checkbox and show per-checkbox progress (checking spinner/indicator). When a check completes and the cleanup step is possible, enable the checkbox; if the step is not applicable or not possible, the checkbox stays disabled with the reason shown.
3. Review and improve the archive-dialog architecture to match this new check-first workflow (see Implementation Decisions).
4. Do NOT build a big "Herdr manager" feature. Just the status check plus stop.

## Acceptance criteria

- Opening the archive (or delete) dialog for a ticket starts all checks in parallel; each checkbox shows a visible in-progress state until its check resolves.
- Each checkbox is enabled only after its check confirms the step can be performed:
  - Delete worktree: worktree directory exists, is clean (no uncommitted changes), and is not busy (not locked by another process). Note the busy check must run after the Herdr check so the reason can mention the running agent, but each check is still independent; a running Herdr agent inside the worktree usually makes the worktree busy - the dialog does not need to model that coupling beyond showing the individual results.
  - Delete local branch: branch exists and is merged into the main branch.
  - Delete remote branch: remote branch exists.
  - Stop the Herdr agent: a Herdr Agent named `{projectSlug}--{folderName}` exists in the workspace labeled `{projectSlug}` (any status). If Herdr is not installed or no agent exists, the checkbox is disabled with the reason.
- Disabled checkboxes are unchecked and show a short reason (e.g. "No worktree", "Branch has unmerged commits", "Herdr is not installed", "No Herdr agent").
- Enabled checkboxes default to checked-state loaded from the persisted preferences (localStorage), extended with the new stopHerdrAgent option (default true).
- A check that errors (e.g. git command fails) surfaces the error in the dialog next to that checkbox; it must not be swallowed.
- Submitting runs the selected steps in order: stop Herdr agent first, then worktree cleanup (worktree, local branch, remote branch), then archive/delete the ticket. Any failure stops the sequence and shows the error in the dialog; the ticket is not archived/deleted.
- Submit button stays enabled while checks run (the user may archive without any cleanup); it is disabled only while submitting, per the UI rule (no button-text changes).
- Existing behavior preserved: archive moves the ticket folder to archive; delete removes it; both revalidate the board; tickets without any applicable cleanup can still be archived/deleted through the same dialog.
- spec/archive-ticket.md is updated to describe the new workflow.
- All existing tests pass; new unit tests cover the check aggregation and controller state machine; e2e covers the dialog check-progress flow against the real server (Herdr CLI absent in e2e means the Herdr checkbox is disabled with "Herdr is not installed" - assert that).

## Implementation Decisions

These are the design authority for the plan.

1. One unified dialog. Replace the ArchiveTicketDialog / WorktreeCleanupDialog split with a single TicketCleanupDialog (shared component) used for both archive and delete, for every ticket regardless of hasAgentWorktree. Tickets with nothing applicable simply show all checkboxes disabled (it degrades to a confirm dialog). Delete the now-unused dialog/controller and their tests. project-page-controller loses the openArchive/openDelete branching on hasAgentWorktree.
2. Check-first state model. The dialog controller owns a per-item state machine: each cleanup item is `{ state: "checking" } | { state: "ready" } | { state: "blocked"; reason: string } | { state: "error"; error: ErrorInfo }`. Items: stopHerdrAgent, deleteWorktree, deleteLocalBranch, deleteRemoteBranch. Checks start when the dialog opens (and re-run if it is reopened for another ticket). Checkbox enabled only in "ready".
3. Server-side check endpoint. One "use server" query-style function, e.g. `getCleanupStatus(projectSlug, folderName)` in ticket-api.ts (or a colocated cleanup-api.ts), that runs all four checks in parallel server-side (Promise.allSettled semantics - one failing check must not hide the others) and returns a typed discriminated result per item. Client calls it once per dialog-open. Per-item progress on the client comes from the single in-flight call: all items show "checking" until it resolves. (Four separate round-trips are not required; do not over-engineer.)
4. Check logic reuses existing managers. Extend AgentWorktreeManager use: worktree existence (fs), isWorktreeClean, isWorktreeBusy, isBranchMerged, hasRemoteBranch (plus a branch-existence check). WorktreeCleanupService keeps its submit-time guard checks (defense in depth) but the same predicates back the pre-checks so logic is not duplicated - extract shared predicate helpers if needed.
5. Herdr control module. New src/core/launcher/herdr-control.ts wrapping the Herdr CLI with execFile (no shell string interpolation; on win32 spawn through cmd or resolve the executable so a herdr.cmd shim works). Functions: `findHerdrAgent(projectSlug, folderName)` returning a discriminated result (`herdr-missing` | `no-agent` | `{ paneId, agentStatus }`), and `stopHerdrAgent(paneId)`. Agent lookup mirrors run-agent-herdr.ps1: workspace with label === projectSlug, agent with name === `{projectSlug}--{folderName}`; stop = `herdr pane close <paneId>`. Multiple matching workspaces/agents is an error surfaced to the user, same as the ps1. Unit-test with an injected exec function; never launch real herdr in unit/e2e tests (that would be a shell test).
6. Submit pipeline. Extend the cleanup server function to accept the new option `stopHerdrAgent: boolean` and perform stop-agent before WorktreeCleanupService.cleanup. Keep the existing typed error results (never throw from the action path). Archive/delete of the ticket folder remains the final step, skipped if any earlier step fails.
7. Persisted options. Extend CleanupOptions (client-side persistence in worktree-cleanup-pure.ts) with stopHerdrAgent (default true). Effective checked state = persisted preference AND item is "ready".
8. Naming. Follow the glossary: use `projectSlug`, `folderName`, "Herdr Agent". No bare `slug`. Prefer `undefined` over `null`. No z-index; dialog stacking stays on Portal-based DialogRoot.
