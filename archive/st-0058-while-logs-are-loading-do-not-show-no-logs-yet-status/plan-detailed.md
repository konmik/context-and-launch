# ST-0058 detailed implementation plan

## Objective

Change the Application Logs dialog so the first read has an explicit pending state. The dialog must show a readable loading status while that first read is unresolved, show `No logs yet.` only after a completed read returns an empty string, and retain the last completed display during ten-second background refreshes.

The implementation must preserve the existing server API, rolling logger, dialog geometry and position persistence, close behavior, clear behavior, polling interval, log markup, and scroll rules.

## Design authority and target shape

The PRD's Implementation Guidance and State Model are authoritative:

- The component state is a discriminated lifecycle/content state, not a single string sentinel:
  - `{ kind: "loading" }` for the first read of a newly opened dialog.
  - `{ kind: "loaded", text: string }` for every completed read, including an empty response.
- Opening starts one lifecycle. That lifecycle initializes state to `loading`, starts the immediate read, starts the existing ten-second timer, and owns a `stopped` guard.
- The initial read is the only operation that can produce `loading`.
- A polling read leaves the existing `loaded` state untouched until its response resolves.
- A completed non-empty response renders the existing `pre` element; a completed empty response renders `No logs yet.`.
- A successful clear directly commits `{ kind: "loaded", text: "" }`; it does not enter `loading`.
- Cleanup marks the lifecycle stopped and clears the timer. Late responses must pass that guard before changing state or scheduling scroll work.

Use the repository's established visible loading wording, `Loading...`, as the body status. Keep it as text in the dialog body so it is available to users and assistive technology without relying on animation.

## Codebase resistance and resolution

1. `src/components/shared/LogViewerDialog.tsx` stores `logs` as `string`, initialized to `""`. That sentinel is both the pre-read value and the completed empty result. Resolve it by introducing a discriminated `LogViewerState` and initializing each open lifecycle to `{ kind: "loading" }`.

2. The current `Show when={logs()}` fallback decides that any falsy string is empty. That couples rendering to a truthiness check and makes pending impossible to represent. Resolve it with explicit state branching: loading text for `kind === "loading"`; for loaded state, branch on `text` only to retain the existing `pre` versus `No logs yet.` markup.

3. The current `load` function updates the shared string after every response, while `firstLoad` exists only for scroll handling. Resetting the whole viewer to a loading sentinel for polling would cause flicker. Resolve it by keeping `firstLoad` solely as scroll metadata and updating the discriminated state only after a response has passed the `stopped` guard. Do not set loading from the interval callback.

4. The existing component has no dedicated log-viewer behavior tests. The project has a real-server Playwright harness and uses request interception for focused server-boundary scenarios. Resolve this by adding an e2e test file that defers only `getAppLogs` server requests, uses the real clear/read path, and uses Playwright's clock control to advance the ten-second interval without changing production timing.

5. The existing project-header regression test checks that the logs control remains present but does not open the viewer. Resolve this by adding focused viewer coverage while leaving the header test intact; the new tests must still open through `project-header-logs-button` so the integration path remains covered.

## Sequencing

### Step 1: Create the explicit log-viewer state seam

Files:

- Create `src/components/shared/log-viewer-state.ts`.

Change:

- Define and export the discriminated `LogViewerState` union with `loading` and `loaded` variants.
- Export a small constructor or type-safe helper only if it keeps the component from repeating object-shape literals; keep the module free of UI, server calls, timers, and DOM references.
- Do not change runtime behavior in this step. This module is the seam that lets lifecycle state and displayed content be reasoned about independently of the existing component implementation.

Why:

- The design requires pending versus completed-empty to be unrepresentable as the same value.
- A named state boundary prevents the component from drifting back to a string sentinel and gives tests and later refactors a stable vocabulary.

Acceptance criteria:

- The new type can represent pending and loaded-empty distinctly.
- The loaded variant permits both empty and non-empty text.
- The module has no dependency on `log-api.ts`, Solid signals, or rendering code.
- TypeScript validation still passes with the new unused seam present.

### Step 2: Refactor the dialog lifecycle onto the state seam

Files:

- Modify `src/components/shared/LogViewerDialog.tsx`.

Change:

- Replace `createSignal("")` with a signal of `LogViewerState`. Set its initial value to the loading variant so the first visible open cannot render the empty fallback before the request completes.
- At the beginning of each `props.open` lifecycle, explicitly reset the state to loading before invoking `getAppLogs()`. This ensures reopening after a prior loaded session starts a fresh initial-read state.
- Preserve the existing `stopped` cleanup guard and ten-second `setInterval`. Treat `firstLoad` as scroll metadata only.
- In `load`, capture the existing near-bottom value before awaiting the read. After the read resolves, return immediately when `stopped` is true. Otherwise set the loaded state with the returned text, then preserve the current `firstLoad || wasNearBottom` `requestAnimationFrame` scroll-to-bottom behavior. Set `firstLoad` false only for an accepted response.
- Ensure the interval invokes the same read path without setting loading first. Thus loaded content remains visible while a refresh is pending, and the prior loaded-empty/content state remains visible until the new response resolves.
- Change the clear button handler so it awaits `serverClearAppLogs()` and then sets the loaded-empty state. Do not reuse the initial loading transition for clear.
- Replace the truthiness-based `Show when={logs()}` rendering with explicit state rendering. Render `Loading...` for loading; for loaded empty render the exact existing `No logs yet.` text; for loaded non-empty render the existing `pre` element, classes, text, ref, and scroll behavior unchanged.
- Do not change `getAppLogs`, `serverClearAppLogs`, `FloatingWindow` props, default/min sizes, `persistRect`, button labels, close callback behavior, or the ten-second interval value.

Why:

- This is the root fix: request lifecycle is represented independently from log content, while refreshes remain non-destructive until completion.

Acceptance criteria:

- A newly opened dialog displays visible `Loading...` while the first `getAppLogs()` promise is pending.
- `No logs yet.` is absent during that pending period.
- A completed empty response renders `No logs yet.` and removes `Loading...`.
- A completed non-empty response renders the same `pre` content and keeps the existing initial/near-bottom scroll behavior.
- During a pending refresh, previously loaded content or the previously loaded-empty state remains visible.
- A completed refresh changes the state to the response result only after resolution.
- A successful clear renders loaded-empty immediately after the clear promise resolves.
- Closing stops the timer and prevents a late response from changing state or scheduling scroll work.

### Step 3: Add focused Playwright coverage for observable transitions

Files:

- Create `e2e/log-viewer-dialog.test.ts`.

Change:

- Use the existing `setupE2E`, project creation, navigation, and cleanup helpers from `e2e/fixtures.ts`.
- Open the dialog through `[data-testid="project-header-logs-button"]`; assert the floating panel and body text through accessible/visible text rather than internal signal names.
- Add a narrowly scoped helper in the test file to intercept only the server-function request for `getAppLogs`. Non-log server requests must continue normally. The helper must expose the deferred response/release and must not mock the application logger or replace the server function.
- Cover initial pending-to-empty: make the log file empty through the real Clear logs action or the test server's real data path, close/reopen, defer the first log read, assert `Loading...` is visible and `No logs yet.` is absent, release the request with an empty result, then assert the inverse.
- Cover initial pending-to-content: defer the first read, assert loading, release with distinctive log text, assert the text is rendered and loading/empty text are absent.
- Cover refresh retention: load distinctive content, use Playwright clock control to advance exactly the existing ten-second interval, defer the refresh, assert the old content remains visible while the request is pending, release with an empty result, and assert `No logs yet.` appears only after release. Repeat the response direction as needed to verify content replacement and existing visible log behavior.
- Cover close/late-response behavior: defer an initial read, close the panel, release the response, assert the closed dialog has not been updated, and advance the clock far enough to show no polling request is scheduled after cleanup.
- Cover clear behavior: load content, click the existing `aria-label="Clear logs"` button, wait for the real clear operation to complete, and assert loaded-empty without observing the initial loading text.
- Keep each scenario deterministic and under the repository's test timing guidance. Always release deferred requests and close pages/routes in cleanup so one test cannot affect another.

Why:

- The PRD asks for observable state transitions, not implementation-name assertions. Real-server Playwright coverage verifies the dialog, server boundary, timer lifecycle, clear action, and close behavior together.

Acceptance criteria:

- The new test file proves all six required component/UI scenarios: initial pending, initial empty, initial content, retained content during refresh, refresh to empty, and clear to empty.
- It proves a late response after close cannot update the dialog and polling stops on close.
- It proves `Loading...` appears only for the initial pending read, not for refresh or clear.
- It does not alter the production polling cadence or stub `getAppLogs`/the application logger.

### Step 4: Validate the change and guard regressions

Files:

- No additional production files; review the modified `src/components/shared/LogViewerDialog.tsx`, new state seam, and new e2e test.

Change:

- Run the repository-standard validation from the worktree: `npm test`, then the focused e2e test and the project-header regression test as needed during iteration, and finally `npm run test:all` because the project guidance requires the full validation including build and e2e.
- Confirm the diff contains no changes to `src/components/shared/log-api.ts`, `src/core/infra/app-logger.ts`, polling duration, floating-window geometry, persisted-position configuration, button labels, or log text formatting.
- Check that the existing project-header log control remains present and usable, and that TypeScript/lint reject no unused or incorrectly typed state seam.

Acceptance criteria:

- `npm run test:all` passes.
- The Application Logs dialog never shows `No logs yet.` before its first read resolves.
- Loaded content, empty results, refresh retention, clear, close, scroll, resize, position persistence, and polling cadence all retain their specified behavior.
- The final diff records the explicit state model rather than a truthiness or empty-string workaround.

## Handoff notes for the implementing agent

- Read the PRD before editing; its Implementation Guidance and State Model override any temptation to preserve the string sentinel.
- Do not “solve” the issue by delaying the empty fallback, adding a second boolean that can drift from the string, or showing loading during every poll. The state must make pending and loaded-empty distinct, and polling must preserve the last completed display.
- Do not change server APIs or logger storage. The fix belongs at the component state/render boundary.
- Keep the existing `stopped` and `firstLoad` lifecycle boundaries unless a test demonstrates they are insufficient; any such design change must preserve the close and scroll acceptance criteria.
