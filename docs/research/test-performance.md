# Test performance plan

## Research

Web search: [Vitest performance and fixtures](https://html.duckduckgo.com/html/?q=vitest%20improving%20performance%20fixtures).

- [Vitest 3 performance guide](https://v3.vitest.dev/guide/improving-performance.html): measure startup, transformation and execution separately. Changing isolation or worker pools requires evidence that state and process APIs remain compatible.
- [Playwright fixtures](https://playwright.dev/docs/test-fixtures): create resources on demand, reuse expensive resources at the appropriate scope, and give each test isolated browser state.
- [Playwright best practices](https://playwright.dev/docs/best-practices): use observable readiness and retrying assertions instead of fixed sleeps.
- [Vite environment handling](https://vite.dev/guide/env-and-mode): build reuse must account for mode, environment files and exposed environment variables.

## Implementation plan

1. Measure representative local-only, remote-backed and Node-only tests through the isolated runner.
2. Move workspace isolation coverage to the Node unit project so it needs no application build or Git template.
3. Cache the selected E2E build using content fingerprints of build inputs and outputs. Rebuild on changes or missing artifacts. Keep the full-suite build unconditional.
4. Create repository storage only when requested. Keep per-file servers and per-test browser contexts isolated.
5. Wait for the real server's listening event through its existing stdout message. Await process termination instead of leaving a three-second timer behind.
6. Start independent browser and server resources together. Give the server fixture ownership of its temporary directory tree and clean it once.
7. Prepare a no-remote Git template once per run, eliminating remote removal from each local-only Project.
8. Split backend, Electron and script tests into an explicit Node project. The Solid plugin otherwise defaults these tests to jsdom. Preserve jsdom for client-side TypeScript and TSX tests.
9. Remove the Project window test's redundant initial Sync and replace its popup sleep with a navigation event.
10. Verify selected existing tests, type checking and changed-file lint. Record cold and warm measurements separately.

## Baseline

Windows, selected workspace isolation, error dialog and Project header files: 14 tests passed. Vite client build took 18.18 seconds and server build 11.85 seconds. Vitest took 11.97 seconds. Error dialog test took 2.417 seconds; Project header cases took 1.042-1.571 seconds.

These are individual runs, not statistical benchmark claims.

## Build cache contract

Selected E2E runs reuse the isolated workspace's build only when the content fingerprints match. Inputs include all tracked and non-ignored files, environment files, exposed Vite environment variables, Node options, Node version, platform and architecture. This conservative input set includes test files because Tailwind scans repository text. The per-run ownership marker is excluded. Client and server output bytes are verified as well, so missing or modified artifacts trigger a rebuild. A failed build cannot leave a valid receipt. Full-suite runs still build unconditionally.

The Windows runner retains the isolated workspace between runs, making warm reuse possible. The current non-Windows runner creates a fresh workspace each time, so its builds remain cold.

## Verification

- The required selected check passed: six workspace-isolation tests and twelve real-server E2E tests, including multiple windows.
- A warm selected run reused the verified build and passed all eight error-dialog and Project header tests in 11.55 seconds of Vitest time. Project header file time was 8.938 seconds, versus 9.769 seconds in the baseline. The main measured saving is the avoided approximately 30-second build.
- After the environment split, 60 selected tests passed across nine Node, client TypeScript and TSX files in 3.31 seconds. Backend cases ran in the Node project; client cases retained jsdom.
- All four updated Project window tests passed with one E2E file running. Individual cases took 0.920-2.771 seconds, including the watcher and popup scenarios.
- TypeScript checking, canonical TypeScript formatting, changed-file Oxlint and whitespace checks passed. No tests were added. Verification used selected existing tests, not the full suite or Electron benchmarks.

## Repeated before-and-after benchmark

Measured on Windows x64, Node 26.7.0, pnpm 11.22.0 and Vitest 3.2.6, with an Intel Core i9-13900HX and 32 GiB RAM. The baseline is commit `58351c2`, checked out in a separate detached worktree with the same locked dependencies installed offline.

Each workload ran once to warm the isolated workspace, then three measured times. Runs were sequential, through the public `pnpm test` command. Wall time includes pnpm, workspace preparation, builds, Vitest and teardown. The comparison is for selected workloads, not the full suite. Warm build reuse is part of the optimized behavior; the baseline rebuilds every time.

| Workload | Baseline wall samples (s) | Optimized wall samples (s) | Baseline median (s) | Optimized median (s) | Reduction |
| --- | --- | --- | --- | --- | --- |
| 44 backend tests | 6.514, 6.762, 6.730 | 5.728, 5.709, 5.729 | 6.730 | 5.728 | 14.9% |
| 72 mixed tests | 56.244, 56.351, 56.145 | 23.488, 23.263, 22.901 | 56.244 | 23.263 | 58.6% |

All runs passed. Backend Vitest time fell from a median 2.220 seconds to 0.997 seconds. Mixed Vitest time fell from 17.130 seconds to 14.320 seconds. All three optimized mixed samples reused the verified build. The optimized mixed warm-up rebuilt the app and took 55.689 seconds, so the warm result should not be presented as cold-build performance.

The backend workload selects these files:

- `tests/electron/built-app.test.ts`
- `tests/core/infra/git.test.ts`
- `tests/core/ticket/context-api-validation.test.ts`
- `tests/core/config/config-repository.test.ts`
- `tests/core/launcher/resolve-conflicts.test.ts`

The mixed workload adds:

- `tests/components/shared/directory-picker.test.ts`
- `tests/util/stored-signal.test.ts`
- `tests/components/ui/primitives.test.tsx`
- `tests/scripts/test-workspace-isolation.test.ts` (the baseline path is `e2e/test-workspace-isolation.test.ts`)
- `tests/e2e/error-dialog.test.ts`
- `tests/e2e/project-header.test.ts`
- `tests/e2e/project-window.test.ts`

Invoke `pnpm test` with the listed paths to reproduce each workload. Raw sample JSON, console output and per-test timing logs from this measurement are retained in `C:/Users/elkmo/AppData/Local/Temp/opencode/test-performance-results`.

## Continued optimization

The first optimization is committed as `2efd490`.

Mixed selections now enter the isolated runner once. Suite grouping happens inside that workspace, preserving sequential unit and E2E execution, explicit shell selection and fail-fast behavior. The source mirror, runtime directories, ownership token, drive mapping and lock are prepared once per public invocation. The timing log also retains both phases instead of being removed between them.

The Git template now uses the existing fast-import fixture helper to create distinct main and tickets root commits. Two clones and explicit tickets tracking replace temporary worktrees, pushes and per-repository identity configuration. Global setup uses six direct Git processes instead of twelve shell-wrapped Git processes.

The same warm-up and three-sample benchmark passed after this batch:

| Workload | Final wall samples (s) | Final median (s) | Reduction from baseline |
| --- | --- | --- | --- |
| 44 backend tests | 5.867, 5.763, 5.730 | 5.763 | 14.4% |
| 72 mixed tests | 21.339, 21.446, 20.843 | 21.339 | 62.1% |

Mixed wall time improved another 8.3% from the first batch's 23.263-second median. Backend wall time was effectively unchanged. All three mixed samples reused the verified build; the rebuilding warm-up took 51.542 seconds. Mixed Vitest time had a median of 14.800 seconds, so the additional wall-time gain is outside test execution.

The selected check passed workspace-isolation and runtime-mount coverage, the three benchmark browser files, and the remote-push case in `tests/e2e/sync-button.test.ts:14`. Final TypeScript, canonical formatting, ESLint and whitespace checks passed. Changed-file Oxlint reported no errors and one warning for the existing ownership-check throw in `scripts/run-tests.mjs`'s finally block.

## Optimization attempts after fdbfb87

Stopping rule: stop after three consecutive attempts reduce the mixed workload's median public-runner wall time by less than 5%. Each attempt uses the same 72-test selection, one warm-up and three measured runs. Compare against the latest retained variant. The 44-test backend workload remains a secondary measurement. All samples passed; all measured mixed runs reused a verified build. These are selected-workload results, not full-suite performance claims.

| Attempt | Mixed samples (s) | Median (s) | Reduction | Decision | Consecutive below 5% |
| --- | --- | --- | --- | --- | --- |
| Starting point | 21.339, 21.446, 20.843 | 21.339 | - | Baseline | 0 |
| Parallel workspace mirror, eight copy workers | 19.421, 18.903, 18.700 | 18.903 | 11.4% | Retain | 0 |
| Two browser workers instead of four | 18.674, 18.823, 18.754 | 18.754 | 0.8% | Revert; improvement within variation | 1 |
| Harness polling and asynchronous Git in window tests | 18.825, 18.953, 18.829 | 18.829 | 0.4% | Retain simpler waits; no meaningful speedup established | 2 |
| Parallel independent browser-context and server teardown | 18.777, 18.414, 18.726 | 18.726 | 0.5% | Retain concurrent cleanup | 3 |

The two-worker experiment was reverted before the polling attempt, so the polling comparison uses 18.903 seconds. The final result is 12.2% below this round's starting point and 66.7% below the original 56.244-second baseline. Small per-attempt differences remain within run-to-run variation. Backend median wall times were 5.763 seconds initially, then 4.993, 4.740, 4.616 and 4.668 seconds respectively; later backend variation cannot be attributed to browser-only changes.

The investigation progressed from runner overhead to browser-test group concurrency, then the slow Project window cases and their cleanup. Timing logs identified roughly nine-second header/window files, versus roughly one second for the backend Vitest group. Window tests now use Vitest's built-in polling rather than the shared 500ms loop, preserving their existing deadlines and assertions. Git polling uses the existing asynchronous direct-process fixture helper. Independent browser contexts close concurrently; browser/server teardown awaits both operations even if one fails.

Optimization stopped at the specified three-attempt threshold. Raw logs use the labels `mirror-parallel`, `browser-two-workers`, `window-polling` and `parallel-teardown` in the measurement directory above.

Final verification passed: selected `pnpm run check` for workspace isolation, error dialog, Project header and Project window; TypeScript checking; canonical formatting and Prettier; changed-file ESLint and Oxlint; and whitespace validation. Formatting, TypeScript and lint ran only after the attempts finished. No tests were added.

## Action-level profiling

Set `TEST_ACTION_TRACE_DIR` to an output directory before running selected tests through `pnpm test`. The shared E2E fixture writes per-process `*-actions.jsonl` records for Project seeding, navigation, header/content readiness, browser/page creation, context cleanup and server/browser startup/shutdown. Records include the test name and elapsed milliseconds. It also records a uniquely named Playwright trace per browser context, including popup actions. Traces have test titles and disable screenshots, snapshots and sources. Open a trace with `pnpm exec playwright show-trace <trace.zip>` to inspect individual navigation, click, selector, evaluation and clock calls.

Profiling is opt-in. Normal benchmarks leave the variable unset. Trace capture and serialization add overhead, so diagnostic action measurements and untraced wall-time benchmarks are separate. Action durations can overlap across files and must not be summed as suite wall time. Fixture navigation measurements also overlap the Playwright navigation records.

Three diagnostic runs used the same 12 browser tests. Outputs and extracted summaries are in `C:/Users/elkmo/AppData/Local/Temp/opencode/test-action-profile`, under `baseline`, `direct-loopback` and `final`.

| Action | Count | Initial total (s) | Final total (s) | Initial median (ms) | Final median (ms) |
| --- | --- | --- | --- | --- | --- |
| Playwright navigation | 14 | 8.484 | 2.968 | 582 | 230 |
| Header readiness after fixture navigation | 13 | 4.216 | 5.669 | 239 | 399 |
| Content readiness after header | 13 | 0.080 | 0.076 | 6 | 5 |
| Project seeding | 16 | 1.687 | 1.643 | 41 | 61 |
| Browser page creation | 14 | 1.022 | 1.195 | 69 | 81 |
| Clicks | 16 | 0.666 | 0.734 | 42 | 46 |
| Browser context close, excluding trace serialization | 14 | 0.077 | 0.090 | 5 | 6 |

Navigation was the dominant action. The shared server fixture bound IPv4 but returned a localhost URL. Returning the bound IPv4 address directly reduced diagnostic navigation time, consistent with avoiding address-family connection delays. Some work shifted into the subsequent readiness wait: the combined fixture navigation plus header-readiness total fell from 12.346 to 8.587 seconds. The tracing data does not establish a network-level cause by itself.

Readiness waits then dominated. The direct-loopback diagnostic run recorded 6.338 seconds waiting for headers, with several waits around 380 or 880 milliseconds. Replacing selector-wait backoff with Vitest's standard polling around Playwright visibility/count checks reduced the final diagnostic header total to 5.669 seconds. The helpers preserve visible, hidden and detached semantics, existing deadlines, and first-match behavior. Click actionability checks remain Playwright's responsibility.

| Untraced attempt | Mixed samples (s) | Median (s) | Reduction from previous retained variant | Decision |
| --- | --- | --- | --- | --- |
| Starting point | 18.777, 18.414, 18.726 | 18.726 | - | Baseline |
| Direct IPv4 loopback | 17.827, 18.483, 18.073 | 18.073 | 3.5% | Retain |
| Shared readiness polling | 17.305, 17.625, 17.129 | 17.305 | 4.2% | Retain |
| Skip Git template sample files | 17.107, 17.589, 17.567 | 17.567 | -1.5% | Revert |

All measured runs passed and reused verified builds. The third consecutive attempt below 5% ended this round. The retained result is 7.6% below this round's starting point and 69.2% below the original 56.244-second selected-workload baseline. These remain warm selected-workload measurements, not full-suite or cold-build claims.

Final selected verification passed 14 tests across five files, including hidden-dialog behavior and remote Git push in addition to the profiled browser cases. Formatting, TypeScript checking, changed-file ESLint and Oxlint passed after all attempts. No tests were added.
