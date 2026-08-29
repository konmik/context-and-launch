## General

- Be brief.
- Do not add comments unless explicitly asked.
- Do not add Co-Authored-By lines to commit messages.
- Never push to remote.
- Never use the memory system.
- Never use claude -p or claude --print flags. These modes are billed.

## Safety

- Never swallow errors with empty catch blocks. Always surface errors to the user.
- Never silently delete, overwrite, or force-remove user data (worktrees, files, branches with uncommitted work). If a resource is in the way, return an error telling the user how to resolve it.
- There cannot be any pre-existing errors. All tests pass before and after merging. If there is an error, fix it immediately, do not leave it for later.
- Never add silent fallback defaults. If a required value is missing, throw an error. The user must see what went wrong.
- Fix bugs at the right depth. Before writing a fix, trace the root cause through the architecture and fix it where it belongs, not where the symptom appears. If the fix requires a special case on top of shared infrastructure, the fix is not deep enough: generalize the underlying mechanism instead. Never patch a caller when the contract of the callee is wrong. Compounding shallow fixes degrades the codebase and makes future changes harder.

## Code style

- We are using only TypeScript, do not check for types randomly, do not write incorrect-type tests.
- Do not duplicate code. Extract shared logic into reusable helpers.
- Avoid non-ASCII unless explicitly asked.
- Never use ^ or ~ in package.json dependency versions. Always pin the exact version.
- Do not use underscore or bold markdown formatting in md files.
- Never use bare "slug" as a variable, parameter, property, or type field name. Always qualify it: `projectSlug`, `columnSlug`, `contextFileName`, etc. The only exception is generic slug utility functions like `requireSafeSlug` and `toSlugSegment`. See CONTEXT.md for the full glossary.
- Prefer `undefined` over `null`. Use optional fields (`foo?: string`) instead of `foo: string | null`. Use `null` only when an external API requires it (DOM, Node-style callbacks).

## UI

- Do not use z-index (Tailwind z-* classes). Use Portal from @solidjs/web for stacking.
- Do not change the text of buttons when running, use a disabled state instead.

## Building

- Build Electron distributable: `pnpm run electron:dist`.
- On Windows this produces `dist-electron/context-launch-setup.exe` (NSIS installer).
- On macOS this produces `dist-electron/context-launch-setup.dmg`.

## To start a dev run when the user asks

- Run `powershell -ExecutionPolicy Bypass -File .\scripts\run-open-3003.ps1`.
- The script stops any existing listener on port 3003, starts the dev server, and opens
  `http://localhost:3003` in Google Chrome.

## Testing

- Run dev server: `pnpm run dev`.
- Run all tests: `pnpm run test:all` (tsc + unit + build + e2e). Never skip e2e.
- During implementation, run only the specific affected test file or test case.
- Do not run the full test suite when only one test or narrowly scoped area changed. Run only the affected test file or test case.
- Run the full test suite after broad changes that affect multiple areas are complete.
- Always run tests on the T: RAM disk through the pnpm scripts (`pnpm run test`, `pnpm run test:e2e`, `pnpm run test:all`). If T: is missing, create it with `pnpm run test:ramdisk:create`; it needs administrator elevation, so ask the user to run it. Never fall back to the `:workspace` variants to get around a missing RAM disk: they run in the source tree, are slower, and their timings are not comparable to RAM-disk runs.
- Every test run writes per-test timings (setup, execution, cleanup) to `test-timing.log`. Find it in the run's temp folder: `T:\context-launch-tests\<project>\<branch>\temp\test-timing.log` under the official RAM-disk runner, or `%LOCALAPPDATA%\Temp\test-timing.log` for direct runs. Set the `TEST_TIMING_LOG` env var to store it somewhere else.
- Do not run tests (unit, e2e, build, or screenshots) for pure design/styling changes (CSS, colors, class tweaks) unless the user explicitly asks. Just make the edit.
- Never run shell tests unless the user explicitly asks you to run them.
- Never run benchmarks (e2e/*.bench.ts) unless the user asks for them. Benchmarks open the real Electron app on screen; they only run via `vitest bench` (or `--benchmark`), never in a plain `pnpm exec vitest run`. Scope runs explicitly to keep them fast: `pnpm exec vitest run --project unit-ts --project unit-tsx --project e2e` (or use `test:all:workspace`).
- Any test that launches a terminal or console-host process (powershell, cmd, wt) is a shell test. Name it *.shell.test.ts so it runs only via `pnpm run test:shell`, never in test or test:all.
- Tests must never run the real herdr binary or launch a real agent. Every herdr boundary is faked: e2e points the herdr command templates at fake-herdr.mjs (or a stub that resolves to "not installed"), unit tests mock herdrExec, and shell tests intercept the herdr command inside the harness so the real CLI and real agents are never reached.
- Write UI tests with playwright.
- e2e tests run the real server against a sandboxed CONTEXT_LAUNCH_DATA_DIR temp dir and a scratch git repo, drive the UI with playwright, and assert on real side effects (config.json contents, git branches/worktrees). Use the e2e/real-server.ts harness. Never stub the app's own server functions; mock only true external boundaries.
- e2e/mock-server.ts is a fixture for pure-UI rendering tests that need no real backend behavior.
- Never add timeouts in code unless explicitly asked. Use standard and idiomatic features of the test harness (event-driven waits, hooks, built-in retry/poll helpers) to make tests deterministic instead.
- A test must finish within 3 seconds when run alone without multithreading. Under the full parallel suite tests may run slower; the timeout limits (suite testTimeout/hookTimeout, helper wait deadlines) exist only to stop a broken test from hanging — they are not how long a test may take. If a test takes longer than 3 seconds when run alone, fix the cause immediately. Never dismiss a timeout as an unrelated change you are not going to fix, and never fix a slow test by raising its timeout.
- A flaky test is a real failure. Never dismiss a failing test as flaky, and never re-run a test to get a green result. Fix the cause: a test that passes in isolation but fails under the full suite is a real ordering, resource, or concurrency bug in the test or the code.
- Profile per-file test timings: `pnpm exec tsx scripts/test-timings.ts`. Runs the unit-ts and unit-tsx projects once in a single warm, single-threaded vitest process, reads per-file durations from the JSON reporter, and writes a sorted summary to `temp/timings.txt`.

## Specs

- Spec files in `spec/` describe behavior as nested bullet lists in plain English. No code, no pseudocode. Short sentences. Represent control flow with nesting.

## Data access

- Use Solid Router query()/action() for all data access.
- Server functions use "use server" and are colocated with features in *-api.ts files under src/components/.
- Reads use query() through Solid 2 async memos or projections under local Loading and Errored boundaries.
- Loading states are rendered explicitly by consumers without replacing stale content during refresh.
- Mutations use action(). Server functions return typed discriminated results (never throw).
- Fire-and-forget side effects use plain "use server" functions without action().
- Server functions import from src/core/ to call stores and managers directly.

## Component architecture

- Split complex components when the non-UI logic is substantial enough to test in isolation.
- Use pure function modules for stateless data transforms.
- Thin controllers may be collapsed into their components.
- Separate data from behavior. Data types contain only fields. Command types contain only functions. Never mix data and function references in the same type/interface/object.
- Separate data types by update trigger. Group fields that change together into one type. Cross-cutting derivations are standalone accessors.
- Treat state as immutable. Signal setters replace, never mutate in place.

## Agent skills

### Issue tracker

Issues are tracked using Context & Launch's own ticket system (ticket folders in a git worktree on an orphan branch). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context repo with CONTEXT.md at the root. See `docs/agents/domain.md`.
