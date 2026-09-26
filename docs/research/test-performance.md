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

- `electron/built-app.test.ts`
- `src/core/infra/git.test.ts`
- `src/core/ticket/context-api-validation.test.ts`
- `src/core/config/config-repository.test.ts`
- `src/core/launcher/resolve-conflicts.test.ts`

The mixed workload adds:

- `src/components/shared/directory-picker.test.ts`
- `src/util/stored-signal.test.ts`
- `src/components/ui/primitives.test.tsx`
- `scripts/test-workspace-isolation.test.ts` (the baseline path is `e2e/test-workspace-isolation.test.ts`)
- `e2e/error-dialog.test.ts`
- `e2e/project-header.test.ts`
- `e2e/project-window.test.ts`

Invoke `pnpm test` with the listed paths to reproduce each workload. Raw sample JSON, console output and per-test timing logs from this measurement are retained in `C:/Users/elkmo/AppData/Local/Temp/opencode/test-performance-results`.
