# ST-0024 Fix IDE closing when started from the app and the app closes -- detailed plan

## Repository

Work in the git worktree:
`C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0024-fix-ide-closing-when-started-from-the-app-and-the-app-closes`
Branch: `ai/st-0024-fix-ide-closing-when-started-from-the-app-and-the-app-closes`.

Read `CLAUDE.md` in the repo root first and follow it (brief code, no comments unless asked, pinned versions, no empty catch blocks, run `npm run test:all` before finishing, never push).

## Problem statement

When the user launches an IDE from the app (the "Shortcut" feature, e.g. the
"WebStorm Windows" shortcut `"C:\Program Files\JetBrains\WebStorm\bin\webstorm64.exe" .`)
and then closes the Context & Launch Electron app, the IDE is killed together
with the app. Expected: the IDE keeps running independently.

## Root cause (verified in source)

All launches (IDE shortcuts and coding-agent profiles) go through
`spawnDetached()` in
`src/server/launcher/agent-launch.ts` (lines 18-68). Despite its name, the
spawn is NOT detached:

```ts
const child = spawn(executable, args, {
  cwd,
  stdio: ["ignore", "pipe", "pipe"],
});
```

There is no `detached: true`. On Windows, libuv (Node/Electron) assigns every
non-detached child process to a global Job Object created with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (plus `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`).
When the parent process exits, the OS closes the job handle and kills every
process still in the job. The server runs in-process inside the Electron main
process (`electron/server-adapter.ts` imports `.output/server/index.mjs` into
the Electron process), so an IDE started via a shortcut is a direct child of
the Electron main process and dies when the app quits.

Why only the IDE dies and not the agent terminal: the agent profile runs
`powershell -File config-defaults/run-agent.ps1 ...`, which starts Windows
Terminal via `Start-Process`. Because the libuv job has
`SILENT_BREAKAWAY_OK`, grandchildren break away from the job automatically;
only the direct child (the transient powershell) is in the job. An IDE exe
launched directly (webstorm64.exe) IS the direct child, so it gets killed.

Passing `detached: true` to `spawn()` makes libuv skip the job-object
assignment on Windows (and call `setsid()` on POSIX), so the child survives
the parent exiting. Precedent already exists in this repo:
`src/server/infra/open-in-os.ts` uses `detached: isWin` (for a different
reason, but the comment documents the Windows show-state/console inheritance
behavior).

macOS is not affected in practice (`open -a ...` hands off to launchd), and
`detached: true` (setsid) is harmless there.

## Fix design

1. Add `detached: true` to the spawn options in `spawnDetached` for all
   platforms. Keep the existing piped stdout/stderr and the 10-second early
   failure window (they are independent of detachment and the error
   reporting is covered by tests and the spec).
2. Extract `spawnDetached` into its own module so a real behavioral test can
   import it. Existing tests note that `agent-launch.ts` cannot be imported
   in vitest because it pulls in singletons via the `~` alias
   (`~/server/config/instances.js`). The extracted module must use only
   relative imports.
3. Add a real regression test: a child launched through `spawnDetached`
   keeps running after its parent process exits. On Windows this test fails
   without the fix (the job object kills the grandchild) and passes with it.
4. Update `spec/agent-launch.md` to state the survival behavior.

## Step 1 -- extract spawnDetached into its own module

Depends on: nothing.

Create `src/server/launcher/spawn-detached.ts`:

- Move from `src/server/launcher/agent-launch.ts` verbatim (then modify):
  - `const SPAWN_DETACH_DELAY_MS = 10000;`
  - `export async function spawnDetached(...)` (currently lines 18-68).
- Import `ProcessError` with a relative path: `import { ProcessError } from "../shared/errors.js";`
  (do not use the `~` alias here; the whole point is vitest importability).
- Import `spawn` from `"child_process"`.
- Change the spawn options to include `detached: true`:

```ts
const child = spawn(executable, args, {
  cwd,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
```

- Add an optional last parameter so the survival test does not need to wait
  10 seconds: `export async function spawnDetached(executable: string, args: string[], cwd: string, detachDelayMs = SPAWN_DETACH_DELAY_MS): Promise<void>`
  and use `detachDelayMs` in the existing `setTimeout` inside the `spawn`
  handler. Production call sites pass no fourth argument, so behavior is
  unchanged.
- Keep everything else identical: the console.log of the spawn label, stderr
  accumulation, the `error` / `exit` / `spawn` handlers, `child.unref()`,
  the ProcessError messages.

Update `src/server/launcher/agent-launch.ts`:

- Delete the moved code (`SPAWN_DETACH_DELAY_MS` constant and the
  `spawnDetached` function body) and remove the now-unused `spawn` import
  (keep `execFileSync`, still used by `processStartSec`).
- Add `import { spawnDetached } from "./spawn-detached.js";`
- Re-export it so the existing route import keeps working, or update the
  route import (next bullet). Prefer updating the route import and NOT
  re-exporting (avoid two import paths for the same symbol).
- `spawnProfile` must still contain the literal call
  `spawnDetached(executable, args, cwd)` -- the code-inspection test
  `src/server/launcher/agent-launch.test.ts` line 61 asserts the source
  matches `/spawnDetached\(executable,\s*args,\s*cwd\)/`. Do not rename the
  locals.

Update `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/shortcut/run.ts`:

- Change the import on line 3: take `resolveTicketAndProject` and
  `resolveLaunchDir` from `~/server/launcher/agent-launch.js` and
  `spawnDetached` from `~/server/launcher/spawn-detached.js`.
- This file uses tabs for indentation; preserve that. `agent-launch.ts` and
  the new module use 2-space indentation and double quotes.

Acceptance criteria:

- `npx tsc --noEmit` passes.
- `npx eslint .` passes.
- `npx vitest run --exclude 'e2e/**'` passes (in particular
  `src/server/launcher/agent-launch.test.ts` "spawnProfile delegates to
  spawnDetached" still passes).
- `git grep -n "spawnDetached"` shows exactly: the definition in
  `spawn-detached.ts`, the import+call in `agent-launch.ts` (spawnProfile),
  the import+call in `shortcut/run.ts`, and tests.

## Step 2 -- behavioral tests for spawn-detached

Depends on: Step 1.

Create `src/server/launcher/spawn-detached.test.ts` (vitest, runs in the
unit phase; spawning real node child processes in unit tests is established
practice in this repo, see `src/server/worktree/worktree-cleanup.test.ts`
line 200).

Test group A -- error/success contract (in-process, fast):

- "resolves when the process exits 0 before the detach delay": call
  `await spawnDetached(process.execPath, ["-e", "process.exit(0)"], cwd)`
  with a temp cwd; expect it to resolve.
- "rejects with ProcessError when the process exits non-zero": spawn
  `["-e", "console.error('boom'); process.exit(3)"]`; expect rejection,
  `instanceof ProcessError`, and the message/stderr to include `boom` or
  exit code 3 (match the existing ProcessError shape in
  `src/server/shared/errors.ts` -- read it first).
- "rejects with ProcessError when the executable does not exist": spawn a
  nonsense executable name; expect rejection with ProcessError.
- These tests use real processes, not mocks. Use `fs.mkdtempSync` temp dirs
  and clean them up in `afterEach`.

Test group B -- the regression test for this ticket (parent-exit survival):

- Create a fixture script `src/server/launcher/spawn-detached.survival-fixture.ts`
  (it must compile under `tsc --noEmit` and pass eslint; it is not a test
  file so vitest will not pick it up):

```ts
import { spawnDetached } from "./spawn-detached.js";

const pidFile = process.argv[2];
if (!pidFile) throw new Error("pidFile argument is required");
const grandchildScript =
  "require('fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 30000);";
await spawnDetached(process.execPath, ["-e", grandchildScript, pidFile], process.cwd(), 100);
process.exit(0);
```

  Notes: the explicit `process.exit(0)` is required because the still-open
  stdout/stderr pipes to the live grandchild would otherwise keep the
  fixture's event loop alive. `detachDelayMs = 100` keeps the test fast.
  For `node -e`, `process.argv[1]` is the first extra argument (the pid
  file path).

- The test:
  1. Resolve the tsx CLI so the fixture (TypeScript) can run in a plain
     node child: `const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");`
     (`tsx` 4.22.4 is already a devDependency).
  2. Spawn the fixture as a separate parent process:
     `spawn(process.execPath, [tsxCli, fixturePath, pidFile], { cwd: repoRoot, stdio: "pipe" })`
     where `repoRoot` is `path.resolve(__dirname, "../../..")` and
     `pidFile` is in a fresh temp dir. Capture stderr for diagnostics.
  3. Wait for the parent to exit; assert exit code 0 (include captured
     stderr in the failure message).
  4. Poll (up to 10s) until the pid file exists, then parse the grandchild
     pid. Polling is needed because the grandchild may finish startup
     after the parent has already exited.
  5. Wait ~500ms (lets any kill-on-job-close propagate), then assert the
     grandchild is still alive: `process.kill(pid, 0)` does not throw
     (treat `EPERM` as alive, mirroring `isAlive` in `agent-launch.ts`).
  6. In `finally`, terminate the grandchild with `process.kill(pid)`;
     catch and rethrow anything that is not `ESRCH` (no blanket empty
     catch -- CLAUDE.md forbids swallowing errors).
- Give this test a generous timeout (e.g. 30s, vitest third argument).
- Sanity-check the red/green behavior on Windows: with `detached: true`
  removed from `spawn-detached.ts` this test must fail (grandchild dead or
  pid file never written); with the fix it must pass. Do this check once
  manually while developing the test, then leave the fix in.

Test group C -- source guard (cheap insurance matching repo conventions):

- Read `spawn-detached.ts` source in the test and assert it contains
  `detached: true`, mirroring the code-inspection style used in
  `agent-launch.test.ts`.

Acceptance criteria:

- `npx vitest run src/server/launcher/spawn-detached.test.ts` passes on
  Windows.
- Temporarily reverting `detached: true` makes the group B test fail on
  Windows (verified once during development).
- No orphan node processes remain after the test run
  (`Get-Process node` count is back to baseline).

## Step 3 -- update the spec

Depends on: Step 1 (wording must match implemented behavior).

Edit `spec/agent-launch.md`. Under the bullet
"Spawn detached process, wait up to 10 seconds" (line 25), add a nested
bullet in plain English, e.g.:

```
- Spawn detached process, wait up to 10 seconds
  - Exits with non-zero code before timeout: error
  - Spawned process is detached from the app, so it keeps running after the app closes
```

Spec rules (CLAUDE.md): nested bullets, plain English, short sentences, no
code, no bold/underscore markdown.

Acceptance criteria: the spec mentions that spawned processes survive app
close; no other spec content changed.

## Step 4 -- full validation

Depends on: Steps 1-3.

1. Run `npm run test:all` (tsc + eslint + unit + build + testid gate + e2e).
   All must pass. Never skip e2e. Note the e2e suite runs a real server;
   the shortcut e2e test (`e2e/ticket-detail-shortcuts-tab.test.ts`) only
   asserts the request is issued, so it is unaffected by this change.
2. Manual verification on Windows (recommended if an interactive session is
   available, otherwise document as not performed):
   - `npm run electron:dist`, install/run `dist-electron/context-launch-setup.exe`
     (or `npm run electron:build-main && npm run electron:start` after
     `npm run build` for a faster loop).
   - Open a ticket, run an IDE shortcut (e.g. VS Code or WebStorm), wait
     for the IDE window, then quit the app. The IDE must stay open.
   - Also launch a coding agent (Claude Windows profile) and confirm the
     Windows Terminal window still opens and receives the prompt
     (the launcher powershell now runs with DETACHED_PROCESS, i.e. no
     console; `run-agent.ps1` does not need one -- it uses Start-Process
     and WScript.Shell SendKeys -- but verify the end-to-end flow once).
     Then quit the app and confirm the agent terminal stays open.
3. Commit on the current branch with a message starting
   `ST-0024 Fix IDE closing when started from the app and the app closes`.
   No Co-Authored-By line. Do not push.

## Edge cases and risks

- Windows console allocation: `detached: true` implies DETACHED_PROCESS, so
  console children (powershell launcher) get no console window. They do not
  need one, and this removes any console flash. The agent's visible
  terminal is Windows Terminal started by `Start-Process` inside
  `run-agent.ps1`, unaffected.
- stdout/stderr pipes stay open in the server for the lifetime of the
  child. This is pre-existing behavior (needed for the 10s failure window)
  and does not re-attach the child to the job object. After the app exits,
  a child writing to the broken pipe gets a write error, not a kill; IDEs
  do not depend on stdout.
- macOS/Linux: `detached: true` calls setsid. The macOS agent flow
  (`run-agent.sh`, `open -a Terminal`) and shortcuts (`open -a WebStorm .`)
  are unaffected; children there already survive parent exit. The survival
  test passes on all platforms but only guards the regression on Windows.
- `child.unref()` is already called; do not remove it.
- e2e harness (`e2e/real-server.ts`) kills only the server process itself,
  not a process tree, so detaching children does not break e2e teardown.
  e2e shortcut tests use instant `echo` commands; nothing long-lived leaks.
- Existing code-inspection tests pin exact source text of
  `agent-launch.ts` (`parseLaunchRequest` defaults, `spawnProfile(profile,
  commandVars, launchDir)`, `spawnDetached(executable, args, cwd)`, ticketDir
  derivation). Do not reformat unrelated parts of `agent-launch.ts` when
  removing the moved code.
- Do not "fix" `src/server/infra/open-in-os.ts`; it is already detached on
  Windows and explorer/open are fire-and-forget.
- Out of scope: the default "VS Code" shortcut command `code {{projectPath}}`
  cannot spawn on Windows without shell resolution of `code.cmd`
  (ENOENT from spawn). That is a separate pre-existing issue; do not widen
  this ticket to add `shell: true` (it would change quoting/injection
  semantics). Mention it in the final report if observed.

## Files touched (summary)

- Create: `src/server/launcher/spawn-detached.ts`
- Create: `src/server/launcher/spawn-detached.test.ts`
- Create: `src/server/launcher/spawn-detached.survival-fixture.ts`
- Modify: `src/server/launcher/agent-launch.ts` (remove moved code, import new module)
- Modify: `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/shortcut/run.ts` (import path)
- Modify: `spec/agent-launch.md` (one nested bullet)
