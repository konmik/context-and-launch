# Detailed implementation plan

## Goal and measured baseline

Optimize the unit-test suite without changing shipped behavior or weakening assertions. The benchmark authority is `scripts/test-timings.ts`, which runs the `unit-ts` and `unit-tsx` projects in one warm fork with file parallelism disabled.

The Phase 1 baseline measured 77 files. Files over the ticket's 3-second isolation limit were:

| Test file | Baseline |
| --- | ---: |
| `src/core/ticket/ticket-sync-resolution.test.ts` | 23.39s |
| `src/core/infra/file-watcher.test.ts` | 17.54s |
| `src/core/board/project-page-service.test.ts` | 15.72s |
| `src/core/ticket/ticket-sync.test.ts` | 12.44s |
| `src/core/ticket/ticket-store.test.ts` | 10.99s |
| `src/core/worktree/agent-worktree.test.ts` | 10.69s |
| `src/core/worktree/worktree-manager.test.ts` | 8.85s |
| `src/core/worktree/agent-worktree-cleanup.test.ts` | 8.71s |
| `src/core/command-template/platform-shell-runner.test.ts` | 8.14s |

Faster files worth checking after the mandatory work are `context-api-validation.test.ts` (2.02s), `TicketDetailDialog.test.tsx` (1.96s), `sync-pending.test.ts` (1.77s), `worktree-cleanup-errors.test.ts` (1.37s), `ticket-order.test.ts` (1.30s), `worktree-cleanup.test.ts` (1.22s), and `launcher-config.test.ts` (1.18s).

## Measurement and retention protocol

Use the same clean, warm-fork method for every theory:

1. Before editing a target, run `npx tsx scripts/test-timings.ts` once and copy `temp/timings.txt` outside `temp` as that theory's before snapshot. When a current snapshot from the immediately preceding retained commit already covers the target, reuse it rather than adding an unneeded run.
2. Make only the files named by that theory. Run the directly affected test files with:

   `npx vitest run --project unit-ts <test-file...> --no-file-parallelism --poolOptions.forks.singleFork=true`

   Use `--project unit-tsx` for `.test.tsx`. If a theory creates or changes a `*.shell.test.ts`, also run `npm run test:shell -- <test-file>`.
3. Run `npx tsx scripts/test-timings.ts` again. Compare `endTime - startTime` in `temp/results.json` with the before snapshot. Repeat once when the apparent improvement is under 10% to reject ordinary run-to-run noise.
4. Retain a theory only if all affected tests pass, no target regresses materially, and the target shows a repeatable improvement of both at least 5% and at least 100ms. Commit that theory alone with its measured before/after values in the commit message/body.
5. If the threshold is not met, discard only that theory's edits and record the rejected idea in the ticket notes; do not commit speculative helper or production code. Never retain a file split whose only benefit is hiding the same total work under multiple per-file clocks.

After every retained theory, run `npm test` before committing. At the end, run `npm test`, `npm run test:shell`, and `npx tsx scripts/test-timings.ts`. Final acceptance is all 77+ unit files passing, every unit file at or below 3.00s in the authority report, no shell-test regression, and lower total wall-clock time than the Phase 1 baseline.

## Optimization steps

### 1. Restore the suite's fast Git configuration for command-template-backed tests

**Files:** `src/test-git-env.ts`, `src/core/command-template/command-template.test-utils.ts`, and focused assertions in `src/core/command-template/command-template.test-utils.test.ts` (new).

**Change and reason:** Export a single test-only Git configuration builder from `test-git-env.ts` and have `createTestCommandTemplateService` merge it into Git command requests. Today command definitions set `GIT_CONFIG_COUNT=1` for `core.longpaths`, which masks the setup file's `commit.gpgsign=false`, `gc.auto=0`, `maintenance.auto=false`, `core.fsmonitor=false`, and `core.editor=true` entries for manager calls. Preserve `core.longpaths` and all production command text; only the test helper should add the test-safe Git settings. Add `core.fsync=none` only as a separately measured sub-theory, because it trades durability for speed and must never escape the test helper.

**Measurement:** Benchmark all seven Git-heavy over-limit files together: `ticket-sync-resolution.test.ts`, `project-page-service.test.ts`, `ticket-sync.test.ts`, `ticket-store.test.ts`, `agent-worktree.test.ts`, `worktree-manager.test.ts`, and `agent-worktree-cleanup.test.ts`, followed by the full timing script.

**Acceptance:** The new helper test proves that the final request contains `core.longpaths` plus every test setting, the seven suites remain behaviorally unchanged, and at least one suite plus their combined time meets the retention threshold.

**Commit/discard:** Commit the exported configuration and request merge together if accepted. Discard the entire theory, or discard only the `core.fsync=none` sub-theory, if it has no repeatable gain.

### 2. Replace FileWatcher wall-clock sleeps with controllable boundaries

**Files:** `src/core/infra/file-watcher.ts`, `src/core/infra/file-watcher.test.ts`, and `src/core/infra/file-watcher.integration.test.ts` (new, only if a small real-chokidar contract group is needed).

**Change and reason:** Add constructor-injected, defaulted adapters for watcher creation and timeout scheduling/clearing. Production defaults remain `chokidar.watch`, `setTimeout`, and `clearTimeout`. In unit tests, use a fake `FSWatcher` event emitter and Vitest fake timers to cover idempotent watch, ready catch-up, debounce replacement/cancellation, `stop`, `stopAll`, dot-path filtering, error logging, and callbacks without the current 30+ sleeps. Keep only the smallest set of tests that genuinely prove chokidar observes real filesystem add/change events and real Git auto-commit; make them readiness/predicate driven instead of sleeping fixed 500–3000ms windows. Do not move tests to an excluded project merely to improve the report.

**Measurement:** Run both watcher files in the isolated unit command, then the full timing script. Sum the old single file and any new integration file when judging the gain.

**Acceptance:** All existing observable cases remain asserted, the combined watcher time improves by the retention threshold, and each resulting file is at or below 3.00s. The real integration subset must still prove one event-driven commit, dotfile exclusion, and watcher restart/additivity.

**Commit/discard:** Commit the defaulted seam and rewritten tests together only with a measured combined win. If the fake boundary makes behavior harder to verify or the real subset remains over 3s, discard it and instead test a smaller seam (timer only, then watcher factory) as separate theories.

### 3. Remove redundant ProjectPageService conflict setup

**Files:** `src/core/board/project-page-service.test.ts` and, only if fixture reuse is measurable, `src/core/ticket/sync-test-repos.ts`.

**Change and reason:** Delete the `beforeAll` call that builds a fully resolved scratch repository and throws its result away before each test builds another one. Then test, as a separate theory, whether a prebuilt conflict scenario in `sync-test-repos.ts` can be copied safely per test while rewriting absolute remote/worktree paths. Do not share a mutable repository between cases and do not alter the Windows open-directory case.

**Measurement:** Run `project-page-service.test.ts` alone after removing the unused setup; measure the template theory separately if attempted; then use the full timing script.

**Acceptance:** All page status, restored-board, unreachable-remote, Windows lock, agent-worktree enrichment, and in-flight-load assertions pass. Each retained sub-theory meets the retention threshold and the file reaches 3.00s or less.

**Commit/discard:** Commit removal of the unused setup independently. Commit scenario templating separately only if copying and path rewriting are reliable and measurably faster; otherwise discard templating.

### 4. Template expensive TicketSync repository states

**Files:** `src/core/ticket/sync-test-repos.ts`, `src/core/ticket/ticket-sync.test.ts`, and `src/core/ticket/ticket-sync-resolution.test.ts`.

**Change and reason:** Extend the existing lazy base repositories with cloneable, immutable scenario templates for the states recreated most often: remote configured/no tracking branch, diverged conflict, existing remote branch with no upstream, and clean non-conflicting divergence. Each test receives private copies and `setGitOriginUrl` rewrites copied remotes. Replace repeated clone/add/commit/push setup only; keep manager operations and end-state assertions real. Where setup-only assertions call Git repeatedly for facts already returned by a fixture, return the prepared SHA/ref from the fixture instead. Never cache or share a repository after a test begins mutating it.

**Measurement:** Benchmark the two sync files independently and together, then the full timing script. Include template construction in the measured warm fork so the result reflects real suite cost.

**Acceptance:** Both sync files pass unchanged behavioral scenarios, their combined time improves by the retention threshold, neither file exceeds 3.00s, and no scenario depends on test ordering.

**Commit/discard:** Commit one scenario template at a time when its consumers show a repeatable win. Discard any template that has expensive copy/path-repair overhead or flaky absolute Git worktree metadata.

### 5. Stop creating Git repositories for TicketStore tests that only need a directory

**Files:** `src/core/ticket/ticket-store.test.ts`, `src/core/ticket/context-api-validation.test.ts`, `src/core/ticket/ticket-order.test.ts`, and `src/test-temp.ts` only if a shared plain-directory fixture removes duplication.

**Change and reason:** Change the default store fixture to a plain temporary directory. Use a clone of one initialized repository template only in the small tests that explicitly inspect Git status/history or rely on repository metadata. The `TicketStore` mutations are filesystem operations and the majority of the 100+ cases do not need the current `git init` plus empty commit. Apply the same distinction to context path validation and ticket ordering after `ticket-store.test.ts` succeeds.

**Measurement:** Measure `ticket-store.test.ts` first as its own theory. Measure `context-api-validation.test.ts` and `ticket-order.test.ts` as separate follow-ups, then run the full timing script.

**Acceptance:** All rollback, traversal, archive, dependency/group, reference, order, and on-disk assertions pass; every explicit “uncommitted/no commit” case still uses a real initialized repo; `ticket-store.test.ts` reaches 3.00s or less. Faster-file edits must independently meet the retention threshold.

**Commit/discard:** Commit the TicketStore conversion alone. Commit each faster-file conversion independently. Discard conversions that do not improve time; do not retain a generalized helper unless at least two retained consumers use it.

### 6. Reuse immutable Git roots in worktree manager tests

**Files:** `src/core/worktree/agent-worktree.test-utils.ts`, `src/core/worktree/agent-worktree.test.ts`, `src/core/worktree/worktree-manager.test.ts`, `src/core/worktree/agent-worktree-cleanup.test.ts`, `src/core/worktree/worktree-cleanup.test-utils.ts`, `src/core/worktree/worktree-cleanup.test.ts`, and `src/core/worktree/worktree-cleanup-errors.test.ts`.

**Change and reason:** Generalize the already-present branch-keyed repository template so `WorktreeManager` and cleanup tests clone/copy clean main/master/develop roots rather than invoking init/add/commit for every case. Add keyed remote-state templates only for repeated remote adoption/behind-remote states. Keep tests for malformed `.git`, born branches, locked worktrees, races, busy processes, and remote failures constructed explicitly because their setup is the behavior under test. Replace fixed 200ms busy-process sleeps with a bounded predicate that proceeds as soon as `isWorktreeBusy` reports true. Cleanup should prune only roots that actually registered worktrees and may run independent roots concurrently, but cleanup concurrency is a separate measured sub-theory.

**Measurement:** Measure `agent-worktree.test.ts`, `worktree-manager.test.ts`, and `agent-worktree-cleanup.test.ts` after each fixture addition. Measure the two already-fast cleanup files separately. Run the full timing script after each retained sub-theory.

**Acceptance:** The three mandatory files each reach 3.00s or less; real Git worktree creation/removal, malformed metadata, branch merge, remote, and race behaviors remain covered; no cross-test repository sharing or ordering dependency appears. Optional cleanup-file changes meet the retention threshold.

**Commit/discard:** Commit clean-root templating, remote-state templating, predicate waiting, and concurrent cleanup as separate commits. Discard any sub-theory whose copy/prune overhead erases the gain or introduces intermittent cleanup failures.

### 7. Reduce real shell launches to distinct integration contracts

**Files:** `src/core/command-template/platform-shell-runner.ts`, `src/core/command-template/platform-shell-runner.test.ts`, `src/core/command-template/platform-shell-strategy.test.ts`, `src/core/command-template/platform-shell-fixture.test-utils.ts`, and `src/core/command-template/platform-shell-runner.shell.test.ts` only if the repo's shell-test convention requires relocation.

**Change and reason:** Extract the pure invocation-building/classification decisions currently private in `platform-shell-runner.ts` without changing their defaults. Test quoted executable resolution, newline rejection, and exit-code classification as pure unit cases. Retain one real shell smoke case for command-not-found versus chosen non-zero exit, the detached early-exit/error contracts, stderr cleanup, and both parent-exit survival cases. Consolidate duplicate real PowerShell launches that assert the same classification. Predicate-wait for process/file readiness rather than fixed 300/500ms slack. Moving genuinely external shell contracts to `*.shell.test.ts` is allowed only when `npm run test:shell` continues to execute them and combined unit+shell wall time improves; it is not sufficient merely to remove them from the unit benchmark.

**Measurement:** Run the unit file and any shell file, compare their summed wall time with 8.14s, then run both the shell suite and full timing script.

**Acceptance:** Cross-platform and Windows-specific classification, exact exit codes, newline guards, detached error mapping, temp-file removal, child survival, PowerShell resolution, and `windowsHide` remain covered. The unit file is at or below 3.00s, combined time meets the retention threshold, and shell coverage still passes.

**Commit/discard:** Commit pure seam plus tests together if accepted. Commit predicate waits separately. Discard any relocation or consolidation that merely shifts time, weakens a real-process guarantee, or has no combined gain.

### 8. Audit the remaining faster candidates without speculative commits

**Files/theories:** `src/components/ticket/TicketDetailDialog.test.tsx` (replace `setTimeout(0)` flushing with Solid/testing-library completion signals where possible), `src/core/board/sync-pending.test.ts` (clone one clean/upstream Git template), and `src/core/launcher/launcher-config.test.ts` plus `src/core/config/initialize.ts` only if copying an immutable initialized config fixture is faster than recreating defaults.

**Change and reason:** Apply one narrowly measured theory at a time after every >3s file passes. Preserve user-visible component behavior, real pending-change Git semantics, and config serialization. Do not change production initialization solely to serve tests; any config fixture belongs in test code.

**Measurement:** Run each target alone with the appropriate isolated command and then the full timing script. Compare each target independently with its Phase 1 value.

**Acceptance:** The file passes, the focused behavior remains asserted, and the change independently clears the retention threshold without regressing another file or total suite time.

**Commit/discard:** One commit per successful faster-file theory. Discard every non-improving theory and stop once the remaining candidates lack an evidence-backed setup/wait cost.

## Completion checklist

- Every retained optimization has a before/after measurement and its own commit.
- No production default changed for test speed; injected seams preserve existing defaults.
- No assertion was deleted without equivalent coverage, and no slow test was merely moved outside all normal test commands.
- `npm test` and `npm run test:shell` pass.
- `npx tsx scripts/test-timings.ts` reports every unit file at or below 3.00s and a lower total than the Phase 1 baseline.
