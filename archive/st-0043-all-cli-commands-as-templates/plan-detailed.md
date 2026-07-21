# Detailed Implementation Plan: Global Command Templates

## Objective and design authority

Implement the fixed, global Command Template catalog described in `product-requirement-document.md`. The PRD's Implementation Decisions are authoritative. A Command Template is not the existing prompt Template: it is a trusted, editable platform-shell action used by shipped runtime behavior.

The highest test and architectural seam is one `CommandTemplateService`. Feature code names a semantic action and supplies runtime values; the service alone loads defaults and sparse overrides, interpolates known values, selects the platform shell, executes the action, and logs its key. The fixed PowerShell/Bash launcher is the only production child-process boundary. Existing environment-variable test stubs remain in front of that seam.

Do not modify the ticket's `status.json`. Do not put Command Templates in project Launcher Config.

## Current-state resistance and required resolution

1. `src/core/infra/git.ts` exposes untyped global `git` and `gitSync` functions, so callers describe executables and arguments instead of semantic actions. `TicketSyncManager`, `WorktreeManager`, `AgentWorktreeManager`, `FileWatcher`, `SyncPendingTracker`, and `GitRepository` all depend on that shape. Resolve this by injecting a semantic Command Template executor into those services and moving literal Git syntax into the bundled catalog. Preserve application decisions between commands whenever output or a probe exit code is inspected.
2. There are five independent process-launch mechanisms: Node `execFile`, Node `exec`, Node `spawn`, `cross-spawn`, and synchronous `execFileSync`. They implement incompatible timeout, detach, output, and error behavior. Resolve this by moving capture, synchronous capture, and detached/interactive shell invocation into a single platform-shell process runner owned by `CommandTemplateService`; retain the current `ProcessError`, `AppError`, timeout, detach, and output contracts at the service boundary.
3. Native file and directory pickers duplicate platform selection and fallback logic in `src/core/infra/native-file-dialog.ts` and `src/components/shared/shared-api.ts`. Resolve this by keeping picker result interpretation in one core picker module and representing each platform's uninterrupted picker/fallback script as a platform-specific Command Template.
4. Herdr execution is split between `src/core/launcher/herdr-control.ts` and hardcoded calls inside `config-defaults/run-agent-herdr.ps1`. Resolve this by moving Herdr output parsing and application branching into TypeScript and giving each parse/decision boundary its own semantic key. Bundled launch helpers must become thin bootstrap consumers of scripts selected by the service; they must not contain literal `herdr`, `wt`, `open`, `launchctl`, `expect`, or other process invocations.
5. Coding Agent Profiles and Shortcuts are currently parsed into executable/argument arrays and bypass any platform shell. Resolve this by running their user-supplied bodies as trusted scripts through the same fixed platform-shell runner. They remain addable/removable Launcher Config data, not fixed catalog entries. Log stable runner identities plus the selected profile or Shortcut name.
6. `config-defaults/run-agent.ps1` and `config-defaults/run-agent.sh` own terminal-start and prompt-delivery process invocations. Resolve this by moving the external-process portions into platform Command Templates and leaving only the minimum re-entry/marker/prompt-delivery bootstrap needed after the app detaches. The service must supply the effective, interpolated bootstrap script; helper files may not independently load or interpolate the JSON catalog.
7. `agentRunning` performs platform-specific process start-time probes directly. Resolve the macOS `ps` and Windows PowerShell probes through platform-specific catalog entries while leaving Linux `/proc` reads and `process.kill(pid, 0)` alone because they are filesystem/OS APIs, not external-process launches.
8. Settings state currently assumes all tabs consume one project-merged Launcher Config. Resolve this by loading Command Templates through a separate global query/action state so no Project scope can leak into persistence, and add a dedicated tab/component rather than overloading Template/Profile editing.
9. `appLog` stores only category plus a formatted string. Resolve this by adding optional structured context while preserving existing callers and log rendering; every Command Template lifecycle event must carry `commandTemplateKey`.
10. The current defaults are copied into mutable user files on first run. That is wrong for a versioned catalog. Resolve this by reading bundled `config-defaults/command-templates.json` on every load and treating `~/.context-launch/config/command-templates.json` as a missing-or-sparse overlay; never copy the bundled catalog into the user directory.
11. Root `run.ps1` and `run.sh` are development/source-tree bootstrap scripts that install dependencies and build the app. They are excluded by the PRD's contributor/build-command rule. Electron starts its server by module import, so there is no shipped server-start child command to catalog. Record this explicit exclusion in the completeness test rather than accidentally cataloging development commands.

## Catalog contract

Create application-owned definitions keyed by dot-separated semantic identifiers. Each definition declares its display label, one of the PRD feature groups, platform applicability, known scalar/list placeholders, working-directory source, environment additions, execution mode (`capture`, `captureSync`, `detached`, or `interactive`), timeout, and output contract. The JSON files contain only `key: string` pairs.

Use the following semantic action families as the initial fixed catalog. Keep separate keys wherever the named source module parses output, treats non-zero as a probe, retries/falls back, or updates application state before continuing. A step may consolidate adjacent invocations into one multiline default only when there is no such boundary.

| Feature group | Required semantic keys/actions |
| --- | --- |
| Git and repository checks | `git.version`; `git.main-branch.probe`; `git.stage-all`; `git.status`; `git.commit`; `git.sync-pending.tracked-probe`; `git.sync-pending.untracked` |
| Ticket Sync | `ticket-sync.remote.list`; `ticket-sync.upstream.resolve`; `ticket-sync.branch.current`; `ticket-sync.push.set-upstream`; `ticket-sync.fetch-origin`; `ticket-sync.head.resolve`; `ticket-sync.upstream.repair` (reset, restore local tree, set upstream as one multiline action); `ticket-sync.ref.resolve`; `ticket-sync.merge-base`; `ticket-sync.reset-soft`; `ticket-sync.fetch`; `ticket-sync.fast-forward`; `ticket-sync.push`; `ticket-sync.merge-tree`; `ticket-sync.commit-tree`; `ticket-sync.reset-hard`; `ticket-sync.staged-files`; `ticket-sync.ancestor.probe`; `ticket-sync.ahead-count`; `ticket-sync.conflict-marker.probe`; `ticket-sync.gpg-signing.read` |
| Conflict Resolution | `conflict-resolution.upstream.resolve`; `conflict-resolution.scratch.create`; `conflict-resolution.fetch`; `conflict-resolution.rebase`; `conflict-resolution.push`; `conflict-resolution.head.resolve`; `conflict-resolution.snapshot-base.resolve`; `conflict-resolution.local-changes.rebase`; `conflict-resolution.rebase.abort`; `conflict-resolution.scratch.remove` |
| Worktree management | `worktree.branch.local-list`; `worktree.add-existing`; `worktree.create-orphan` (create plus empty initial commit); `worktree.remote.list`; `worktree.remote-branch.probe`; `worktree.adopt-remote` (fetch plus tracked worktree add); `worktree.prune`; `worktree.list` |
| Agent Worktree lifecycle | `agent-worktree.list`; `agent-worktree.branch.local-list`; `agent-worktree.add-existing`; `agent-worktree.main.status`; `agent-worktree.behind-upstream.count`; `agent-worktree.create`; `agent-worktree.status`; `agent-worktree.remote-branch.probe`; `agent-worktree.busy.probe.macos`; `agent-worktree.busy.probe.linux`; `agent-worktree.branch.remote`; `agent-worktree.prune`; `agent-worktree.local-branch.probe`; `agent-worktree.merged.probe`; `agent-worktree.remote.list`; `agent-worktree.main.fetch`; `agent-worktree.merge-tree`; `agent-worktree.main-tree`; `agent-worktree.remove`; `agent-worktree.branch.delete-local`; `agent-worktree.branch.delete-remote` |
| Herdr integration | `herdr.workspace.list`; `herdr.workspace.create`; `herdr.agent.list`; `herdr.agent.rename-clear`; `herdr.agent.start`; `herdr.agent.stop` |
| Agent launching and process inspection | `agent-launch.terminal.windows`; `agent-launch.terminal.macos`; `agent-launch.process-start.windows`; `agent-launch.process-start.macos`. The non-catalog trusted-script runner identities are `agent-launch.profile` and `agent-launch.shortcut`, logged with the selected name. |
| File and directory pickers | `picker.files.windows`; `picker.files.macos`; `picker.files.linux`; `picker.directory.windows`; `picker.directory.macos`; `picker.directory.linux`. Linux fallback between Zenity and KDialog belongs inside the relevant multiline template because the app does not consume intermediate output. |
| Operating-system open actions | `open.directory.windows`; `open.directory.macos`; `open.directory.linux` |

If implementation discovery reveals another shipped runtime child process, add a semantic definition and bundled default in the appropriate family before migrating the call site. Do not add catalog entries for direct filesystem APIs, Electron APIs, build/package/test commands, or environment stubs.

Use platform suffixes only when the script itself differs. Shared Git/Herdr commands can use one key when the same text is valid in both fixed shells. Actions containing shell-specific control flow must use independent `.windows`, `.macos`, and/or `.linux` keys rather than hiding platform selection in a nested object.

## Implementation sequence

### 1. Establish the command-action seam without changing behavior

Files to create:

- `src/core/command-template/command-template-types.ts`
- `src/core/command-template/platform-shell-runner.ts`
- `src/core/command-template/platform-shell-runner.test.ts`

Files to modify:

- `src/core/launcher/spawn-detached.ts`
- `src/core/launcher/spawn-detached.test.ts`
- `src/core/shared/errors.ts`

Define the command key, platform, metadata, runtime-value, execution request/result, and process-runner interfaces. Separate data from behavior: metadata objects contain no functions, and the runner interface contains no catalog data. Move the current capture, timeout, error, stderr-temp-file, console-detach, and early-exit logic behind the runner. Keep `spawnDetached` as a temporary compatibility adapter so existing tests stay green during the seam refactor.

The runner must accept a fully rendered script plus fixed execution metadata; callers must not pass arbitrary executable names. Support async capture, sync capture, and detached/interactive modes because current behavior uses all of them. Preserve `USER_ERROR_EXIT_CODE`, `ProcessError` fields, `AppError` presentation, child unref timing, cancellation interpretation, and cleanup of temporary files.

Acceptance criteria:

- Existing detached-process unit tests pass unchanged or with assertions moved to the new public seam.
- A fake runner can capture a complete execution request without starting a real process.
- Production child-process imports are now isolated enough that later steps can remove them from feature modules.
- No catalog persistence or feature behavior has changed yet.

### 2. Add fixed metadata, bundled defaults, and catalog completeness checks

Files to create:

- `src/core/command-template/command-template-definitions.ts`
- `src/core/command-template/command-template-definitions.test.ts`
- `config-defaults/command-templates.json`

Files to modify:

- `CONTEXT.md`
- `electron-builder.yml` only if the existing `config-defaults` resource inclusion does not already package the new JSON

Add the catalog keys/actions listed above with labels, PRD group names, platform applicability, known scalar/list placeholders, cwd source, environment, mode, timeout, and output contract. Put all editable script bodies in the bundled JSON, not TypeScript. Defaults must preserve current commands, Git noninteractive environment, timeouts, output formats, picker cancellation conventions, and detached behavior. Multiline defaults must rely on strict runner behavior and must not duplicate shell selection in editable text.

Add Command Template to the glossary, explicitly distinguishing it from Template. Add a completeness test that checks a one-to-one key match between application definitions and bundled defaults, every default value is a string, every group/platform is valid, and platform-specific definitions use flat suffix keys.

Acceptance criteria:

- Bundled JSON is a complete flat `Record<string, string>` and contains no metadata objects.
- Definitions and defaults fail tests on a missing, extra, or mistyped key.
- The packaged app includes the new defaults through the existing `config-defaults` resource.
- The glossary uses the PRD's Command Template terminology.

### 3. Implement global sparse persistence and effective-value merging

Files to create:

- `src/core/command-template/command-template-store.ts`
- `src/core/command-template/command-template-store.test.ts`

Files to modify:

- `src/core/config/config-paths.ts`
- `src/core/config/initialize.ts`
- `src/core/config/config-repository.ts` only if a reusable plain-object validator/write helper is needed
- `src/core/config/config-repository.test.ts`

Add paths for bundled defaults and the global sparse override file at `~/.context-launch/config/command-templates.json`. Do not copy the bundled file during initialization. The store loads and validates the bundled map, treats a missing override file as `{}`, rejects malformed JSON, non-object/array roots, non-string values, and override keys absent from the bundled catalog, and returns effective entries with `isOverridden` state.

Saving accepts unrestricted strings, including empty, malformed shell text, removed known placeholders, and unknown placeholders. A value equal to its bundled default removes the override. Reset removes only the selected key. Both operations preserve all other keys, including other-platform overrides, and use the repository's atomic write. Unknown keys are rejected on load, save, and reset.

Acceptance criteria:

- Tests cover missing overrides, one/many overrides, malformed JSON, invalid value types, unknown keys, a newly added bundled key, default-equivalent save, per-key reset, and preservation of unrelated/platform overrides.
- No per-Project file or Launcher Config field is introduced.
- `initializeDataDir` never overwrites or expands the sparse file during upgrades.

### 4. Implement interpolation, shell selection, strict failure, and key-bearing logs

Files to create:

- `src/core/command-template/command-template-interpolation.ts`
- `src/core/command-template/command-template-interpolation.test.ts`
- `src/core/command-template/command-template-service.ts`
- `src/core/command-template/command-template-service.test.ts`
- `src/core/command-template/platform-shell.shell.test.ts`

Files to modify:

- `src/core/infra/app-logger.ts`
- `src/core/infra/app-logger.test.ts` (create if absent)
- `src/core/shared/errors.ts`

Implement `CommandTemplateService` over the store, definitions, runner, logger, and injectable platform. It must resolve shared/current-platform entries, derive cwd/environment/mode/timeout from fixed metadata, interpolate only placeholders declared by that action, and leave all unknown `{{name}}` text byte-for-byte unchanged. Scalar values become one shell-literal argument. List values become space-separated individually escaped shell-literal arguments. Cover quotes, whitespace, newlines, dollar signs, ampersands, semicolons, backticks, braces, and empty values for PowerShell and Bash.

Use PowerShell on Windows and Bash on macOS/Linux. The non-editable wrapper must enable terminating errors and native-command first-failure behavior on PowerShell and `errexit` plus `pipefail` on Bash; it must propagate the first failing exit code and combined captured output. If the chosen Windows PowerShell host cannot guarantee native-command first-failure semantics, fail visibly at the shell boundary rather than silently running later lines. Interpreter selection is infrastructure and is never read from the catalog.

Add `execute`, `executeSync`, and the detached/interactive execution path. Add a separate `executeTrustedScript` entry point for Coding Agent Profile/Shortcut bodies; it uses the same interpolation, shell, mode, and logging machinery but does not load a catalog body and does not permit arbitrary feature code to select an interpreter.

Extend `appLog` with optional structured context while retaining the existing text log format/listener compatibility. Log start, success, non-zero failure, timeout, and spawn error with `commandTemplateKey`; trusted scripts additionally log `profileName` or `shortcutName`. Do not increase exposure of rendered scripts, interpolated secrets, or captured output beyond current redaction/output-detail behavior.

Acceptance criteria:

- Service tests at the fake runner seam assert effective script, cwd, env, mode, timeout, result/error propagation, and structured keys.
- Blank and invalid scripts are forwarded without validation; known placeholders are escaped; unknown placeholders remain unchanged.
- Real shell tests prove multiline first-failure and scalar/list round trips on the current PowerShell or Bash platform and are named `*.shell.test.ts` so `npm run test:all` does not launch terminals.
- Start, success, failure, timeout, and spawn-error logs include the exact fixed key.

### 5. Wire the service through the application container and refactor Git consumers to semantic actions

Files to modify:

- `src/core/config/service-container.ts`
- `src/core/config/instances.ts`
- `src/core/infra/git.ts`
- `src/core/infra/git-repository.ts`
- `src/core/infra/file-watcher.ts`
- `src/core/board/sync-pending.ts`
- `src/core/worktree/worktree-manager.ts`
- `src/core/worktree/agent-worktree.ts`
- `src/core/ticket/ticket-sync.ts`
- Their existing unit/integration test files under the same directories

Construct one global store/service and inject it into every manager that launches external processes. Replace literal `git(...)`/`gitSync(...)` calls with the exact semantic keys from the catalog and named runtime values. Remove the default construction paths that create an unconfigured `GitRepository` or bypass the container; tests should explicitly supply a real sandbox service or a fake semantic executor.

Preserve application-side boundaries in Ticket Sync and Conflict Resolution: upstream parsing, non-fast-forward detection, conflict-marker interpretation, merge-tree conflict classification, ref comparisons, rebase-state filesystem checks, retries, and state transitions stay in TypeScript. Combine only the explicitly uninterrupted sequences (`ticket-sync.upstream.repair`, orphan creation, remote adoption). Preserve synchronous checks used by `FileWatcher` and Sync Pending through `executeSync`; do not make their public contracts async as an incidental refactor.

Keep direct filesystem fallback behavior, including safe Worktree removal and Windows busy-directory rename probes. The non-Windows `lsof` busy probe becomes platform catalog actions. Preserve Git's `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never` as fixed metadata.

Acceptance criteria:

- Feature tests assert semantic key plus runtime values at the service seam while retaining all existing observable Git behavior in sandbox repositories.
- Ticket Sync and Conflict Resolution tests still cover success, probes, non-fast-forward repair, conflicts, retries, abort, and cleanup.
- No production feature module constructs a Git executable/argument list.
- All manager constructors in tests and the service container use the same explicit command seam.

### 6. Migrate Herdr, process inspection, pickers, and OS opening

Files to modify:

- `src/core/launcher/herdr-control.ts`
- `src/core/launcher/herdr-control.test.ts`
- `src/core/launcher/agent-launch.ts`
- `src/core/launcher/agent-running.test.ts`
- `src/core/infra/native-file-dialog.ts`
- `src/core/infra/picker-paths.ts`
- `src/components/shared/shared-api.ts`
- `src/core/infra/open-in-os.ts`
- Relevant tests and e2e picker fixtures

Route Herdr list/create/rename/start/stop calls through individual semantic keys and keep JSON parsing, duplicate detection, target matching, idle-agent decisions, and missing-Herdr handling in TypeScript. Keep `CONTEXT_HERDR_COMMAND` as a higher-priority test boundary without exposing it as a Command Template setting.

Consolidate file/directory picker orchestration in core. Each platform template emits the same newline-delimited path contract and a documented cancellation exit/result. Linux templates contain Zenity-to-KDialog fallback internally. Keep `CONTEXT_FILE_PICKER_STUB(_FILE)` and `CONTEXT_PICKER_STUB(_FILE)` ahead of execution. Preserve macOS path normalization, Windows STA behavior, ten-minute timeout, cancellation versus error distinctions, and visible unavailable-picker messages.

Route open-directory actions through detached catalog metadata and keep `CONTEXT_OPEN_IN_OS_STUB` ahead of execution. Route process start-time probes through platform keys while retaining Linux `/proc`, stale-marker cleanup, PID reuse tolerance, and null-on-probe-failure semantics.

Acceptance criteria:

- Tests observe the expected Herdr/picker/open/process-inspection key and values, not raw executables.
- Existing environment stubs still bypass real process execution in e2e tests.
- Picker cancellation, unavailable fallback, malformed Herdr JSON, timeout, detached open, and stale Agent Marker behavior remain unchanged.
- `native-file-dialog.ts`, `shared-api.ts`, `open-in-os.ts`, `herdr-control.ts`, and `agent-launch.ts` no longer import child-process modules.

### 7. Move agent/Shortcut launch and bundled bootstrap operations onto the fixed shell path

Files to modify:

- `src/core/launcher/agent-launch.ts`
- `src/components/launcher/launcher-api.ts`
- `src/core/launcher/prompt-interpolation.ts`
- `src/core/launcher/spawn-detached.ts`
- `config-defaults/run-agent.ps1`
- `config-defaults/run-agent.sh`
- `config-defaults/run-agent-herdr.ps1`
- `config-defaults/launcher-config.json` only as needed to preserve the shipped profiles' effective behavior
- Existing agent launch, Shortcut, conflict-resolution, detached-spawn, and shell tests

Run Coding Agent Profile and Shortcut command bodies through `executeTrustedScript`, preserving full shell syntax instead of tokenizing with `shell-quote`. Interpolate their existing known variables with the same platform escaping and leave unknown variables alone. Log stable runner identities and the selected name. Retain Direct Terminal detach/early-failure behavior and user-facing exit-code 64 handling.

Replace every hardcoded external invocation in the bundled launch scripts with effective bootstrap scripts supplied by `CommandTemplateService`. Keep only non-process bootstrap mechanics needed after detachment (Agent Marker lifecycle, prompt token delivery, and re-entry dispatch). Move any Herdr parsing/branching back into TypeScript so the app regains control between catalog actions. If the shipped profile representation needs a backwards-compatible adapter for the existing wrapper-shaped default command strings, recognize only the exact bundled legacy shapes and preserve arbitrary user-edited profile bodies as trusted scripts; do not silently rewrite custom profiles or move them into the fixed catalog.

Acceptance criteria:

- Existing Coding Agent Profiles and Shortcuts remain app/project-scoped addable/removable Launcher Config data.
- Their bodies support pipes, redirects, conditionals, environment assignments, and multiline scripts under the fixed platform shell.
- Bundled helpers contain no literal production process invocations; terminal startup and Herdr actions come from catalog entries.
- Direct Terminal and Herdr shell tests retain prompt delivery, marker cleanup, detach survival, and visible error behavior.

### 8. Add global Command Template server APIs

Files to create:

- `src/components/launcher/command-template-api.ts`
- `src/components/launcher/command-template-api.test.ts` if server API tests are established for this feature

Files to modify:

- `src/core/config/instances.ts`

Add a SolidStart query returning current-platform plus shared entries as serializable view data: immutable key, label, feature group, effective script, override state, and known placeholder names. Add save and reset actions returning typed discriminated results through the existing error UI contract. Do not accept projectSlug as persistence scope. The service/store must re-read the sparse file for each operation so external edits and synced other-platform overrides are preserved.

Acceptance criteria:

- Malformed/unknown-key override files surface through the query/action as visible configuration errors.
- Save accepts arbitrary strings and converts default-equivalent values to reset.
- Reset/save affect one key only and return the fresh effective entry.
- Other-platform overrides are retained but not listed on the current platform.

### 9. Build the dedicated Settings tab and editor

Files to create:

- `src/components/launcher/launcher-settings-command-templates-tab.tsx`
- `src/components/launcher/command-template-editor-dialog.tsx`
- `src/components/launcher/command-template-settings-state.ts`
- Focused pure/controller tests for the new state if nontrivial logic is extracted

Files to modify:

- `src/components/launcher/LauncherSettings.tsx`
- `src/components/launcher/launcher-settings-state.ts` only for tab coordination/error propagation

Add a `Command Templates` tab. Group rows in the exact PRD group order. Each row shows label, immutable key, effective script summary/full preformatted text, and Default/Override state. Editing opens an unrestricted multiline textarea with the trusted-local-code warning, known placeholders as help only, and Save/Cancel. There are no add, delete, rename, reorder, interpreter, or scope controls. Reset is per row, disabled when default, persists before updating the visible effective value, and leaves the editor value intact on persistence failure.

Load this global state independently from merged Launcher Config so opening Settings for any Project shows the same values. On save/reset success, update only the returned row; on failure, use the existing `ErrorDialog` and retain unsaved text.

Acceptance criteria:

- Shared/current-platform entries render in groups with key and override state.
- Blank, unknown-placeholder, and syntactically invalid text can be saved from the UI.
- Cancel discards the edit; Reset affects one row; default-equivalent Save clears override state.
- No Project scope or catalog mutation controls appear.
- Every new interactive control has stable `data-testid` coverage.

### 10. Add end-to-end Settings and persistence coverage

Files to create:

- `e2e/launcher-settings-command-templates-tab.test.ts`

Files to modify:

- `e2e/fixtures.ts`
- `e2e/real-server.ts` only if a helper is needed to expose the sandboxed global override path
- `scripts/testid-coverage.ts` only if required by its existing convention

Use the real server with its sandboxed `CONTEXT_LAUNCH_DATA_DIR`. Test listing/grouping/current-platform filtering, immutable keys, no add/delete/rename controls, multiline edit/save, sparse JSON content, override badge, preservation of a second override, per-row reset, default-equivalent save, malformed JSON error, and unknown override key error. Reopen Settings or reload the page to prove persistence rather than asserting only local component state.

Acceptance criteria:

- Tests assert the real global `command-templates.json`, not a mocked backend.
- A saved override changes effective UI state after reload; reset removes only its JSON property.
- Malformed and unsupported configuration is visibly reported.
- The tests never touch the developer's real config or any Project Launcher Config.

### 11. Add architectural guards and finish migration cleanup

Files to create:

- `src/core/command-template/command-template-boundary.test.ts`

Files to modify/delete:

- `src/core/infra/git.ts` (reduce to semantic compatibility exports or delete once all callers migrate)
- `src/core/launcher/spawn-detached.ts` (reduce to fixed-shell infrastructure or delete its arbitrary-executable API)
- Any obsolete command parsing helpers/imports, including `shell-quote` usage and dependency if no longer used
- All production source/helper files found by the guard

Add a source-level architecture test that scans shipped TypeScript and bundled launch helpers. Permit child-process imports and shell executable literals only in the fixed platform-shell runner/test fixtures. Permit user-supplied command strings only in Coding Agent Profile and Shortcut paths. Require every definition key to have a default and at least one production consumer (or an explicit bundled-bootstrap consumer), and require every semantic execution call to reference a known key. Explicitly exclude root development bootstrap scripts and test/build tooling.

Remove arbitrary executable APIs after the last caller migrates; do not leave a convenient bypass beside the service. Remove now-unused command tokenization and duplicate picker/Herdr helpers.

Acceptance criteria:

- The guard fails if a production module adds `child_process`, `cross-spawn`, literal `git`/`herdr`/picker/open execution, an unknown semantic key, or an orphaned catalog default outside the documented infrastructure/exceptions.
- Grep confirms every catalog key has both a definition/default producer and a runtime or bundled-bootstrap consumer.
- Coding Agent Profile and Shortcut configuration/editing behavior remains intact.

### 12. Verify the complete behavior

Files to modify only if failures expose defects:

- Tests or implementation files from the preceding steps

Run, in order:

1. Focused Command Template store/interpolation/service/definition tests.
2. Existing Git, Ticket Sync, Conflict Resolution, Worktree, Agent Worktree, Herdr, launcher, picker, open, logging, and Settings tests.
3. `npm run test:all` (typecheck, lint, unit tests, build, test-id gate, and real-server e2e).
4. `npm run test:shell` only when explicitly authorized, because the repository classifies terminal/console-host tests separately. If authorization is not available, leave the exact shell-test command and unrun status in the handoff; do not fold those tests into `test:all`.
5. Build the Electron distributable when practical to verify `command-templates.json` is present in packaged `config-defaults`.

Final acceptance criteria:

- All PRD requirements are traced to passing service, feature, shell, architecture, or e2e coverage.
- Current feature outcomes, error presentation, timeouts, output parsing, cancellation, detach/interactive behavior, and environment stubs are preserved.
- Every production external-process action reaches the semantic Command Template boundary except the fixed shell launcher and user-supplied Coding Agent Profile/Shortcut bodies.
- The global override file remains sparse and no `status.json` or Project Launcher Config gains Command Template data.
