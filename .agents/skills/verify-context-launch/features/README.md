# Context & Launch verification map

This map is the maintained source for user-facing verification. Read the applicable recipe before driving; one convenient entry point does not establish every path.

## Baseline preconditions

- Launch through scripts/harness.ts using runVerification. Dependencies and Playwright Chromium must be available.
- Start with an empty disposable registry and the initialized scratch project on main, without remotes.
- Register that project from /add-project before task, editor, or launcher recipes.
- Doctor must pass for the owned instance. There is no authentication.
- Templates contain Verification and one verification-skill; agent profiles and shortcuts are empty.
- Browser recipes do not verify native Electron windows, file pickers, terminal launch, or real agents.

## Driving conventions

- Recipes use the session.page Playwright page inside runVerification; session.server.baseUrl is the actual allocated URL.
- Every run begins with fresh data. Use getByTestId or scoped locators, not coordinates or tab order.
- Use the registration and task creation blocks in scripts/prove.ts as the baseline for downstream recipes.
- Never mutate live app data or register a real project. Never run a real Herdr binary.
- Follow settled-state signals; do not insert sleeps or increase timeouts to hide failures.

## Proof and skip reporting

- Capture action inputs and outcomes in a trace, screenshots, and ARIA snapshots.
- Read persisted files or Git state before deleting scratch state; retain those copies in evidenceDir.
- List feature IDs and entry points in proof.json. Report skipped or blocked entry points explicitly.
- Retain evidence after cleanup and confirm the child exited and scratch state was removed.
- Initial proof covers direct-route registration and header-button task creation/persistence, not every path below.

## Features

- [Projects](projects.md): registration, path-derived main branch, project menu entry, and Git persistence.
- [Tasks](tasks.md): creation, cancel, numbering, and reopening saved tasks.
- [Context editor](context-editor.md): file selection, creation, save, cancel, and delete.
- [Prompt assembly](prompt-assembly.md): task launcher tab, template interpolation, and skill selection; real launch excluded.

Each feature has Sub-features, How to get to it (user POV), Driving it with Playwright, and Gotchas. Update these together with the UI.
