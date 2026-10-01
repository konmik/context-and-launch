---
name: verify-context-launch
description: Verify Context & Launch's real browser UI with isolated Playwright, scratch Git projects, screenshots, traces, and persisted side effects. Use after behavior changes to project registration, tasks, context editing, or prompt assembly; not for Electron-only window behavior.
---

# Verify Context & Launch

Read features/README.md first. This is a Windows verification workflow for the actual Solid/Vite application, not a mock server. The primary surface is the browser UI also embedded in Electron. Electron window restoration, native dialogs, terminals, and OS integration require separately authorized verification; browser proof does not cover them.

## Launch

From the checkout root with Node and the pinned pnpm installed:

```powershell
pnpm install --frozen-lockfile
pnpm exec tsx .agents/skills/verify-context-launch/scripts/prove.ts
```

Dependencies already installed do not need reinstalling. The helper runs the repository's Vite dev entry directly using Node with `--host 127.0.0.1 --port <allocated-port> --strictPort`, through tests/e2e/real-server.ts. This is `pnpm run dev` with isolated launch arguments. It sets HOST, PORT, CONTEXT_LAUNCH_DATA_DIR, and CONTEXT_LAUNCH_SERVER_PROCESS_FILE to run-owned values. Readiness is Vite printing the exact base URL, followed by Doctor's HTTP check. No build, migration, auth, or external seed service is needed. This reads current sources rather than a potentially stale dist build.

The command owns the complete lifecycle: launch, doctor, registration, task creation, evidence, cleanup. It prints the absolute evidence directory immediately. Do not run scripts/run-open-3003.ps1 for verification: it stops a shared port and opens the user's Chrome. Concurrent helper runs use different ports, scratch directories, browser contexts, and evidence directories. Never attach to an existing user instance.

## Doctor

`doctor(session)` in scripts/harness.ts is the read-only health check run automatically before driving. It requires the run-owned child PID to be alive, its launch arguments to reference this checkout's Vite, and GET /add-project with Accept: text/html to return HTTP 200 containing the app mount and entry-client.tsx. The UI is client-rendered, so form selectors are not in the HTTP response. It captures PID, URL, data/project paths, Git revision, and working-tree status in doctor.json and saves doctor-response.txt. If anything looks wrong mid-recipe, run `await doctor(session)` again before another action. It writes evidence only, not app state.

The dev server does not write the production server-process file. Do not use that file as proof of dev-server ownership. Doctor is valid only for the child retained by runVerification, not an arbitrary supplied PID or shared URL.

## Drive

`prove.ts` is an executable TypeScript entry point invoked with tsx; it demonstrates the mapped registration and task paths. Use its imports and runVerification callback wrapper for additional recipes. Write a new recipe beside it so `import { runVerification, doctor, capture, readRegistry, readTaskWorktree } from './harness.js'` resolves. Run that recipe with `pnpm exec tsx` and its checkout-relative path. No test-only HTTP routes or production setters are used.

The callback receives page, server.baseUrl, projectPath, dataDir, scratchDir, and evidenceDir. Use Playwright getByTestId handles in the map. Wait for settled DOM state with locator.waitFor or page.waitForFunction; do not sleep. Reduced motion is enabled. Register the scratch project using the user form before other features. The baseline explicitly chooses verification-tasks; get its path with `readTaskWorktree(session, 'verification-tasks')`, which inspects Git and rejects paths outside scratch state. The registry may omit default tasksPath, so never assume that field exists. Do not point registration at this checkout or another real project.

Herdr command overrides use the repo's unavailable-executable stub; picker calls cancel and OS-open calls no-op at existing production boundaries. Launcher profiles and shortcuts are empty. These deliberate fixture restrictions prevent real agents and external apps from launching. This is not a dry-run: registration creates a real orphan branch and worktree, and task creation writes real files. The proof reads Git branches and status.json to establish those side effects. Do not click Run, Sync, shortcuts, or OS-open controls under this recipe and call them verified.

## Evidence

Evidence lives in `temp/verification/run-<unique suffix>/`, outside scratch state. It is ignored by Git, remains after cleanup, and must be copied elsewhere if checkout temp data will be purged.

- trace.zip records browser actions and resulting DOM/screenshots, including submit actions.
- Before-submit and after-reload PNGs and ARIA snapshots record action inputs and visible persistence.
- side-effects.json copies registry, branch listing, task folder, and saved status before scratch deletion.
- doctor.json identifies the owned instance and source revision; server.log retains post-readiness stdout/stderr.
- proof.json names verified entry points, skips, and mocked external boundaries.
- cleanup.json records process exit and scratch removal. failure.txt preserves a failed attempt.

Use `await capture(session, 'feature-before-action')` and capture again after completion. Store file contents, Git refs, or other side-effect checks alongside UI evidence before teardown. Exercise real user paths; never drive internal state setters. A screenshot of a final screen alone is not proof. Reopen or reload to establish persistence. Every mapped entry point is separate coverage: report omitted paths explicitly. External systems may be mocked only at existing production boundaries, and mocked behavior is not evidence of real external integration.

Inspect a trace with `pnpm exec playwright show-trace temp/verification/run-<printed suffix>/trace.zip`, substituting the exact path printed by the run. Capture and inspect filesystem, Git, and network observations when adding a supposedly safe mode rather than trusting its name.

## Cleanup

runVerification uses finally on success and failure. It closes its own browser, stops only the retained real-server child with stopRealServer, waits for process exit, and removes only the freshly created scratch directory under `%LOCALAPPDATA%/Temp/opencode/verify-*`. The Git project and all its task worktrees are wholly inside that scratch directory. It never kills by process name or deletes evidence. Cleanup errors fail the run and are recorded; a still-running server keeps its scratch state.

After the command exits, read cleanup.json and require scratchRemoved and serverExited to be true with an empty errors list. Confirm trace.zip, proof.json, screenshots, and side-effects.json still exist in the printed evidence directory. Failed iterations also clean up before retrying. If forcibly interrupted, inspect doctor.json and validate the recorded process's command line before stopping only that run's PID; never kill every Node or browser process. Inspect scratch contents before removing interrupted-run data.

## Helpers

- `pnpm exec tsx .agents/skills/verify-context-launch/scripts/prove.ts`: complete registration/task proof and automatic teardown.
- scripts/harness.ts exports runVerification, doctor, capture, readRegistry, and readTaskWorktree for same-directory feature recipes. It reuses the existing real-server and temporary-directory helpers, without importing Vitest fixtures into a standalone process.
- `pnpm exec playwright show-trace <exact trace.zip path>`: review browser actions and outcomes after cleanup.

After behavior changes, use `/maintain-verification-skill` to update this skill and its feature map.
