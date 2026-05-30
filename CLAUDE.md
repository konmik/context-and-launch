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

## Code style

- We are using only TypeScript, do not check for types randomly, do not write incorrect-type tests.
- Do not duplicate code. Extract shared logic into reusable helpers.
- Avoid non-ASCII unless explicitly asked.
- Do not use underscore or bold markdown formatting in md files.
- Never use bare "slug" as a variable, parameter, property, or type field name. Always qualify it: `projectSlug`, `columnSlug`, `contextFileName`, etc. The only exception is generic slug utility functions like `requireSafeSlug` and `toSlugSegment`. See CONTEXT.md for the full glossary.

## UI

- Do not use z-index (Tailwind z-* classes). Use Portal from solid-js/web for stacking.
- Do not change the text of buttons when running, use a disabled state instead.

## Testing

- Run dev server: `npm run dev`.
- Run all tests: `npm run test:all` (tsc + unit + build + e2e). Never skip e2e.
- Write UI tests with playwright.
- e2e tests run the real server against a sandboxed CONTEXT_LAUNCH_DATA_DIR temp dir and a scratch git repo, drive the UI with playwright, and assert on real side effects (config.json contents, git branches/worktrees). Use the e2e/real-server.ts harness. Never stub the app's own server functions; mock only true external boundaries.
- e2e/mock-server.ts is a fixture for pure-UI rendering tests that need no real backend behavior.

## Specs

- Spec files in `spec/` describe behavior as nested bullet lists in plain English. No code, no pseudocode. Short sentences. Represent control flow with nesting.

## Complex component architecture

Split complex components into three layers:

1. Pure functions: stateless data transforms. No signals, no framework imports. Testable with plain unit tests.
2. Controller factory: a function that owns signals internally and returns reactive accessors and commands. Contains no logic -- just wires signals to the pure functions from layer 1.
3. Component: thin wiring that connects the controller to the framework and JSX.

Rules:
- Separate data from behavior. Data types contain only fields. Command types contain only functions. Never mix data and function references in the same type/interface/object.
- Separate data types by update trigger. Group fields that change together into one type. Cross-cutting derivations are standalone accessors.
- Treat state as immutable. Signal setters replace, never mutate in place.
- Do not use effects to clear optimistic overrides when server data arrives. Instead, store the server data reference alongside the override (e.g. `{ order, basedOn: ticketOrder }`), and in the memo check `override.basedOn === currentBase` to decide whether to use the override or fall back.
- For testability, the component should accept the controller's return values as optional props that default to an internally created controller. In production nobody passes them. In tests, pass a pre-built controller to drive state transitions directly (call commands, read accessors) without simulating DOM events. Keep render tests separate -- they verify DOM output given board data, not state logic.
