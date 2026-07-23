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

- Do not use z-index (Tailwind z-* classes). Use Portal from solid-js/web for stacking.
- Do not change the text of buttons when running, use a disabled state instead.

## Building

- Build Electron distributable: `npm run electron:dist`.
- On Windows this produces `dist-electron/context-launch-setup.exe` (NSIS installer).
- On macOS this produces `dist-electron/context-launch-setup.dmg`.

## Testing

- Run dev server: `npm run dev`.
- Run all tests: `npm run test:all` (tsc + unit + build + e2e). Never skip e2e.
- Do not run tests (unit, e2e, build, or screenshots) for pure design/styling changes (CSS, colors, class tweaks) unless the user explicitly asks. Just make the edit.
- Never run shell tests unless the user explicitly asks you to run them.
- Any test that launches a terminal or console-host process (powershell, cmd, wt) is a shell test. Name it *.shell.test.ts so it runs only via `npm run test:shell`, never in test or test:all.
- Write UI tests with playwright.
- e2e tests run the real server against a sandboxed CONTEXT_LAUNCH_DATA_DIR temp dir and a scratch git repo, drive the UI with playwright, and assert on real side effects (config.json contents, git branches/worktrees). Use the e2e/real-server.ts harness. Never stub the app's own server functions; mock only true external boundaries.
- e2e/mock-server.ts is a fixture for pure-UI rendering tests that need no real backend behavior.
- Test timeouts must NEVER be more than 3 seconds. If a test is hitting a 3-second timeout, fix the cause immediately. Never dismiss a timeout as an unrelated change you are not going to fix, and never fix a timeout by increasing it.

## Specs

- Spec files in `spec/` describe behavior as nested bullet lists in plain English. No code, no pseudocode. Short sentences. Represent control flow with nesting.

## Data access

- Use SolidStart query()/action()/createAsync for all data access.
- Server functions use "use server" and are colocated with features in *-api.ts files under src/components/.
- Reads use query() + createAsync. Server functions throw on error; ErrorBoundary catches.
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
