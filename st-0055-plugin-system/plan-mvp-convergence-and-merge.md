# ST-0055 MVP Convergence, Rebase, And Merge Plan

## Goal

Finish ST-0055 by incorporating the useful plugin-system capabilities proven on the rewrite MVP branch, harden the existing Ticket Sync conversion, replay the resulting ST-0055 commit series onto the current Spinloaf `master`, and fast-forward `master` only after all merge gates pass.

This is a design and implementation convergence, not a Git merge between the two repositories. The rewrite MVP is a source and architecture reference. Its application shell, product model, package manager, data paths, and history must not be merged into Spinloaf.

## Source Revisions

Use immutable revisions while implementing and reviewing the convergence:

- ST-0055 implementation: `704947de9bafc5a5fba0a183ff7316afe0f5f15f`
- ST-0055 original base: `f5df7d2f2c3c7cd6075603b78c775058f148e954`
- Rewrite MVP reference: `a57d6a940fe9f708cf268d9f155387fbc1d2feab`
- Spinloaf target `master` at planning time: `c53c221`
- Target-only commits at planning time: `e975fc9`, `6e041ad`, `89cdc0e`, and `c53c221`

Re-read the target `master` SHA immediately before rebasing. Do not assume `c53c221` is still current.

## Target Architecture

Keep direct use of `@deepseek-ai/cordis@4.0.1`. Cordis remains the sole lifecycle authority for contexts, fibers, injection, effects, service isolation, activation, and disposal.

Keep Spinloaf as one npm package. Adopt the MVP's plugin ownership and explicit dependency ideas inside the existing feature-module structure; do not convert the repository to the MVP's pnpm workspace.

The target plugin system has these responsibilities:

- A compiled catalog declares stable Plugin identity, API version, display metadata, default enablement, explicit Plugin dependencies, provided service, configuration schema, host face, renderer faces, and disable guard.
- Cordis injection declares runtime service requirements and controls blocked/active lifecycle behavior.
- The server is the only authority for effective User/Project enablement, validated configuration, dependency resolution, runtime state, and failure state.
- Each Project has an isolated server Cordis owner context and service namespace.
- Each Project Window has an independent renderer Cordis root.
- Plugin-owned contributions are registered through Cordis effects and disappear when their owning fiber is disposed.
- The renderer consumes complete server projections. It never reads or resolves Plugin settings independently.
- Application composition roots select the built-in catalog. Platform and capability modules do not import concrete Plugin implementations.

## Feature Selection

### Adopt From The Rewrite MVP

- Add explicit, acyclic `dependsOn` Plugin metadata.
- Validate duplicate IDs, missing dependencies, dependency cycles, and deterministic dependency order before opening a Project.
- Make Plugin ownership visible: one feature owns its definition, contracts, host face, renderer face, settings, migrations, and tests.
- Use one shared reconciliation policy for server and renderer selection while letting Cordis fibers own actual lifecycle and cleanup.
- Return the complete server-resolved effective Plugin selection and state from mutations instead of making the initiating renderer wait for polling.
- Keep app defaults and Project overrides separate on disk, with Project values taking precedence.
- Keep the built-in roster explicit at server and renderer composition roots.
- Keep cross-feature consumers on public entry points and enforce that rule in production and test code.

### Retain From ST-0055

- Schema-validated Plugin-specific configuration.
- Structured disabled, loading, active, blocked, failed, updating, and pending-disable states.
- Last-good runtime restoration after failed live configuration updates.
- Operation rejection and draining before disablement.
- Plugin-specific disable vetoes.
- Toolbar, dialog, background, and Settings contribution registries.
- Independent Settings and active renderer fibers.
- User/Project Conflict Resolution prompt configuration and idempotent migration.
- Ticket Sync ownership of synchronization, pending state, conflict handling, resolution launch, abort, polling, and UI.
- Existing Context & Launch paths, npm workflow, Electron trust boundary, and all shipped Ticket/Worktree behavior.

### Do Not Import From The Rewrite MVP

- Do not merge or cherry-pick the rewrite MVP Git history.
- Do not copy its Project, Ticket Store, Ticket Folder View, Shell, or editor implementation into the mature Spinloaf product.
- Do not rename the application or move `~/.context-launch` data.
- Do not migrate npm to pnpm or create a workspace solely for Plugin packaging.
- Do not replace `@deepseek-ai/cordis` with the rewrite's `cordis@4.0.0-rc.8` package.
- Do not replace ST-0055's incremental, last-good update behavior with the MVP's dispose-everything reconciliation.
- Do not add dynamic Plugin discovery, installation, third-party code loading, or a marketplace.
- Do not pluginize Board, Forest, Launcher, Herdr, Diff Review, Worktree, or Ticket storage in this change.

## Dependency Model

Add `dependsOn: readonly PluginId[]` to catalog metadata and make it the canonical product-level Plugin graph used for enablement, ordering, diagnostics, and Settings.

Continue using Cordis `inject` for actual runtime services. Distinguish the two dependency classes:

- A required service supplied by another catalog Plugin must correspond to a declared `dependsOn` edge.
- A required host capability is reported as a host-interface dependency and has no Plugin edge.

At catalog validation time, map provided service names to Plugin IDs and reject a Plugin whose declared Plugin dependencies disagree with its injected Plugin services. This prevents the explicit graph and Cordis runtime graph from becoming two conflicting authorities.

When a dependency is saved as disabled or is unavailable, keep the dependent Plugin's saved choice intact and project it as blocked. Reactivate it automatically when the dependency becomes active again.

## Implementation Phases

### Phase 1: Preserve Baselines

- Create durable backup refs for the original ST-0055 tip and base.
- Record the current Spinloaf target `master` SHA.
- Run focused ST-0055 unit, shell, build, and Plugin E2E tests before changing behavior.
- Record pre-existing failures separately from convergence regressions.
- Keep the ST-0055 worktree clean between logical commits.

### Phase 2: Finalize The Catalog Interface

- Extend Plugin definitions with explicit Plugin dependencies.
- Validate IDs, API versions, duplicate services, missing dependencies, and cycles at application startup.
- Produce one deterministic topological catalog order used by server state projection, activation, renderer reconciliation, Settings, and reverse-order disposal.
- Keep configuration schemas and Cordis Plugin objects in the definition; do not introduce an application-owned lifecycle abstraction.
- Replace positional assumptions such as `builtInPlugins[0]` with lookup by stable Plugin ID.
- Add test definitions with zero, one, and multiple dependencies, including missing and cyclic graphs.

### Phase 3: Deepen The Shared Reconciliation Policy

- Extract shared selection and ordering logic used by server and renderer runtimes.
- Keep mounted fibers and Project owner fibers in their existing process-specific coordinators.
- Do not create a second cleanup stack, service registry, dependency injector, or activation state machine around Cordis.
- Serialize all runtime mutations that can affect the same Project.
- Preserve incremental updates so an unrelated Plugin is not restarted when one Plugin changes.
- Dispose Plugin fibers in reverse dependency order and Project owner fibers only after child cleanup completes.

### Phase 4: Make Server State Authoritative By Value

- Return the complete post-commit Plugin snapshot from enablement and configuration mutations.
- Reconcile the initiating renderer directly from that returned snapshot.
- Retain cross-window invalidation for other Project Windows, but use invalidation only as a notification to fetch authoritative state.
- Stop controlled Settings inputs from being overwritten by periodic snapshots while the user is editing.
- Serialize or patch field-level saves so concurrent controls cannot overwrite each other's configuration.
- Treat revisions as ordering tokens and reject or refresh stale saves instead of publishing unused counters.
- Reconcile supported external configuration changes into the live runtime, or explicitly reject external edits as unsupported and keep snapshot/runtime reporting consistent.

### Phase 5: Complete Ticket Sync Ownership

- Keep Ticket Sync as the first optional built-in Plugin.
- Declare its explicit Plugin dependencies and injected host capabilities separately.
- Remove remaining Project-to-Ticket-Sync wrappers and direct implementation imports.
- Keep Worktree local durability and automatic local commits outside Ticket Sync.
- Keep all Ticket Sync server functions gated by the active Project Plugin service.
- Preserve the complete existing successful sync, pending, conflict, resolution, and abort behavior.
- Keep conflict prompt migration idempotent at User and Project scopes.

### Phase 6: Resolve Merge-Blocking Correctness Defects

- Reconcile completed Conflict Resolution into the live Worktree and clear sticky conflict state without making read-only status polling destructive.
- Serialize sync, resolve, abort, and reconciliation per Worktree with the existing Project Git queue or an equivalent single owner.
- Verify scratch-worktree ownership before using or deleting any path; never recursively delete an unverified sibling directory.
- Make User-scope updates transactional across every open Project, including reverse-order rollback and best-effort completion of all rollbacks.
- Close unused Project runtimes at the correct lifecycle seam and prevent stale windows from reopening deleted Projects.
- Permit disabling failed or blocked Plugins without dereferencing a missing provided service.
- Parse required Plugin configuration from the merged saved values instead of requiring every schema to parse an empty object first.
- Handle empty legacy Conflict Resolution prompts without preventing application startup.
- Put renderer contribution execution behind per-Plugin error containment so one render failure cannot take down the Project page or Settings.
- Record disposal failures or remove unsupported disposal failure states from the public projection.

### Phase 7: Enforce Feature Ownership

- Keep `plugin-system` responsible only for catalog policy, persistence, runtime coordination, snapshots, contributions, and transport.
- Keep `plugin-ticket-sync` responsible for Ticket Sync behavior, configuration, faces, migration inputs, and tests.
- Route every external use through each feature's public entry point.
- Remove legacy deep imports and transitional adapters after all callers migrate.
- Extend architecture fixtures to cover Plugin packages, server-only entry points, renderer-only entry points, and test-only entry points.
- Confirm renderer build graphs contain no Node, Git, filesystem, or host-only Ticket Sync implementation.

### Phase 8: Verify Before Rebase

- Run type checking and architecture-boundary checks.
- Run Plugin catalog, runtime, renderer, configuration, migration, and failure tests.
- Run the existing Ticket Sync and Sync Pending matrices unchanged except for import paths.
- Run focused E2E suites for enable, disable, pending disable, veto, multi-window propagation, Project isolation, persistence, and migration.
- Run real Git E2E coverage for successful sync, conflict, resolution completion, and abort.
- Run the full build before changing branch ancestry.

## Required Test Matrix

- Duplicate Plugin IDs fail catalog construction.
- Missing and cyclic Plugin dependencies fail catalog construction.
- Dependency order controls activation and reverse disposal order.
- Disabling a dependency blocks dependents without changing their saved enablement.
- Re-enabling a dependency automatically recovers dependents.
- A missing host capability leaves the real Cordis fiber blocked and reports the capability name.
- Project A and Project B have isolated service instances and independent effective enablement.
- Two windows for one Project converge on one server state without clobbering in-progress Settings edits.
- Failed initial activation leaves no contribution, effect, timer, listener, or service registration.
- Failed live update restores the previous service, configuration, and renderer contributions.
- Disabling waits for tracked operations and rejects new operations.
- Conflict veto leaves both disk configuration and active fibers unchanged.
- A failed or blocked Plugin can be disabled safely.
- Project deletion closes host and renderer runtimes and stale windows cannot recreate it.
- Plugin configuration with required fields validates after User/Project merge.
- Legacy empty and non-empty prompts migrate without startup failure or data loss.
- Ticket Sync operations are serialized per Worktree.
- Completed conflict resolution is reconciled exactly once.
- Scratch cleanup refuses paths not proven to belong to the expected linked Worktree.
- Renderer contribution failures are isolated to the owning Plugin.
- Shutdown waits for operation drain and Cordis disposal exactly once.

## Rebase Onto Spinloaf Master

Perform the ancestry change only after the convergence branch passes the pre-rebase gates.

1. Create `backup/st-0055-before-mvp-convergence` at `704947de` before implementation.
2. Create `backup/st-0055-before-master-rebase` at the final pre-rebase convergence tip.
3. Add or use a temporary local Git remote pointing from the ST repository to `C:\Users\elkmo\_p\Spinloaf`.
4. Fetch the current target `master` into a dedicated remote-tracking ref and record its SHA.
5. Ensure the target Spinloaf `master` worktree and the ST-0055 worktree are clean.
6. Rebase with an explicit old base: replay every commit after `f5df7d2f` onto the fetched target `master` using `git rebase --onto <target-master> f5df7d2f st-0055-plugin-system`.
7. Resolve conflicts in favor of target `master` for unrelated current behavior, then reapply the Plugin ownership changes through the target module's public interface.
8. Preserve `e975fc9` dialog drag-out dismissal behavior.
9. Preserve `6e041ad` cross-Project Worktree ownership detection.
10. Preserve `89cdc0e` open-Ticket-folder behavior and expose it through the appropriate current feature interface.
11. Preserve `c53c221` Forest pointer-move crash fix.
12. Rebuild `package-lock.json` from the final `package.json`; do not hand-resolve lockfile conflict blocks.
13. Use `git range-diff f5df7d2f..backup/st-0055-before-master-rebase <target-master>..st-0055-plugin-system` to inspect every replayed commit for dropped behavior.
14. Re-run the complete post-rebase merge gates.

If the local repositories do not initially share the required objects, fetch the ST branch and target `master` by local-path remotes before rebasing. Do not squash everything into an opaque cross-repository diff before conflict resolution. Preserve logical commits so `range-diff`, review, and regression diagnosis remain useful.

## Post-Rebase Merge Gates

Run these from the rebased Spinloaf branch using the repository's final scripts:

```text
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run test:shell
npm run build
npm run test:e2e
```

Also run the targeted Plugin and Ticket Sync E2E files separately with bounded timeouts before the full E2E command.

The branch is mergeable only when all of these conditions hold:

- The worktree is clean after generated artifacts are excluded or deliberately committed.
- No architecture-boundary fixture regressed.
- The renderer bundle contains no host-only implementation.
- All four target-only `master` fixes remain covered and passing.
- The Plugin settings and lifecycle E2E matrix passes repeatedly, not only once.
- Real Git Sync, conflict, resolution, and abort scenarios pass.
- `git range-diff` shows no unexplained dropped ST-0055 behavior.
- A manual smoke test covers Project open, Ticket edit, Plugin Settings, Sync, conflict recovery, Project Window reopen, and application shutdown.

## Fast-Forward Merge

Immediately before merging, verify that Spinloaf `master` still equals the recorded target SHA. If it moved, fetch it, rebase again, repeat the post-rebase gates, and update the range comparison.

Merge only by fast-forward from the Spinloaf main worktree:

```text
git -C C:\Users\elkmo\_p\Spinloaf merge --ff-only st-0055-plugin-system
```

Do not push, delete backup refs, remove the source worktree, or delete source branches as part of the merge. Those are separate cleanup decisions after the merged application has been exercised.

## Completion Criteria

- ST-0055 retains its richer runtime configuration, diagnostics, rollback, contribution, drain, veto, and Ticket Sync behavior.
- The MVP's explicit dependency graph, deterministic ordering, plugin ownership, shared selection policy, and value-propagation behavior are incorporated without its broad product rewrite.
- Every merge-blocking correctness defect listed in this plan has a regression test and is fixed.
- The resulting branch is based on the latest Spinloaf `master` and contains all target-only fixes.
- The final merge is a verified fast-forward.

## Execution Record

Status on 2026-08-29:

- Final candidate: `st-0055-plugin-system` at `fe2a30b542834c779644d90cff61a449e045e86e`.
- Current target: `master` at `b8c190e`. The candidate's merge base remains `565b5e4`, so another rebase and post-rebase verification are required.
- Backup refs preserve the original implementation, pre-convergence series, first rebased tip, and pre-rerebase tip.
- The last `range-diff` matched ten replayed commits exactly. The foundational commit differed only where the target's explicit Herdr parameters were retained in relocated launcher code and obsolete launcher-owned conflict actions were omitted. Four explained post-rebase commits fix mapped-drive lock detection, E2E timing, inline the architecture-boundary test cases, and remove the Effective Prompt diagnostic.
- `npm ci` completed from the lockfile. The lock root matches `package.json`; npm reported two moderate vulnerabilities.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (148 files, 1,283 tests), `npm run test:shell` (25 tests), `npm run build`, and `git diff --check` passed.
- The isolated Plugin matrix passed repeatedly: Settings 5/5 twice, lifecycle 2/2 twice, and migration 2/2.
- Isolated real-Git Sync, conflict, resolution, abort, polling, pending, drag, error, cleanup, and target-only regression suites passed.
- The full `npm run test:e2e` command was run twice. The final combined run passed 286 tests and failed seven tests in five files under shared-server load; all five files then passed sequentially, 28/28, on the same commit. Isolated real-server execution remains authoritative because the combined runner causes watcher and drag contention.
- The feature worktree is clean. The target SHA moved after validation and must be incorporated before merging.
- Manual smoke testing remains outstanding.
- Fast-forward is withheld pending the final rebase, repeated merge gates, and manual smoke test.
