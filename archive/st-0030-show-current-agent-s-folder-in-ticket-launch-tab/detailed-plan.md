# ST-0030: Show current agent's folder in ticket launch tab

## Goal

Display the resolved launch directory below the "Launch in worktree" checkbox in the Ticket Detail Dialog footer. The client computes the path as the single source of truth and sends it to the server via LaunchRequest. The server stops computing its own path.

## Architecture overview

The change touches three layers:

1. Server data layer: expose the default agent worktree dir to the client via MergedLauncherConfigWithMeta.
2. Client path resolution: add a pure function that computes the launch dir from config, useWorktree, projectPath, and folderName. Wire it into prompt preview and LaunchRequest.
3. Server launch paths: accept launchDir from the client in LaunchRequest and shortcut launch. Remove server-side path resolution from all three launch paths.
4. UI: show the resolved path and a copy button in the footer.

## Step 1: Expose agentWorktreeDir in MergedLauncherConfigWithMeta

### Files to modify

- `src/components/launcher/launcher-api.ts`

### What to do

Add a field `agentWorktreeDir: string` to the `MergedLauncherConfigWithMeta` interface. Populate it in `getMergedLauncherConfig` using `configPaths.agentWorktreeDir(projectSlug)`. This is the fallback worktree root when `worktreeRootPath` is null.

The `ConfigPaths` instance is not directly available in launcher-api.ts. The `launcherConfigManager` exposes `getProjectDir(projectSlug)` but not `agentWorktreeDir`. Two options:

- Option A: Add a method `getAgentWorktreeDir(projectSlug: string)` to `LauncherConfigManager` that delegates to `this.paths.agentWorktreeDir(projectSlug)`.
- Option B: Import `configPaths` from `~/core/config/instances.js` and call it directly.

Preferred: Option A -- it follows the existing pattern where launcher-api.ts calls methods on `launcherConfigManager` rather than reaching into lower-level objects.

### Changes

In `src/core/launcher/launcher-config.ts`, add to `LauncherConfigManager`:

```typescript
getAgentWorktreeDir(projectSlug: string): string {
  return this.paths.agentWorktreeDir(projectSlug);
}
```

In `src/components/launcher/launcher-api.ts`, update the interface and query:

```typescript
export interface MergedLauncherConfigWithMeta extends MergedLauncherConfig {
  projectBoardId: string | null;
  projectName: string;
  projectPath: string;
  worktreeDir: string;
  agentWorktreeDir: string;  // <-- new
}
```

In the `getMergedLauncherConfig` query return, add:

```typescript
agentWorktreeDir: launcherConfigManager.getAgentWorktreeDir(projectSlug),
```

### Acceptance criteria

- `MergedLauncherConfigWithMeta` has `agentWorktreeDir: string`.
- The query returns the correct path (e.g., `~/.context-launch/projects/{projectSlug}/worktrees`).
- Existing tests still pass (`npm run test:all`).

---

## Step 2: Add pure function to compute launch directory on the client

### Files to create

- None (add to existing file).

### Files to modify

- `src/components/launcher/agent-launcher-pure.ts`
- `src/components/launcher/agent-launcher-pure.test.ts`

### What to do

Add a pure function `computeLaunchDir` that takes the relevant inputs and returns the resolved launch directory path.

```typescript
import { worktreeFolderName } from "~/core/worktree/worktree-naming.js";

export function computeLaunchDir(opts: {
  useWorktree: boolean;
  projectPath: string;
  worktreeRootPath: string | null;
  agentWorktreeDir: string;
  folderName: string;
}): string {
  if (!opts.useWorktree) return opts.projectPath;
  const root = opts.worktreeRootPath ?? opts.agentWorktreeDir;
  return root.replace(/[\\/]+$/, "") + "/" + worktreeFolderName(opts.folderName);
}
```

Key behaviors:
- `useWorktree` off: returns `projectPath`.
- `useWorktree` on: joins the effective worktree root (explicit worktreeRootPath or fallback agentWorktreeDir) with `worktreeFolderName(folderName)`.
- Uses forward slashes for consistency (the existing prompt preview already uses forward slashes for ticketDir). The path is passed to the server which handles OS-specific normalization.

### Tests to add (in agent-launcher-pure.test.ts)

```
describe("computeLaunchDir")
  - useWorktree off returns projectPath
  - useWorktree on with explicit worktreeRootPath uses it
  - useWorktree on with null worktreeRootPath falls back to agentWorktreeDir
  - long folderName is truncated by worktreeFolderName
  - trailing slashes on root path are stripped
```

### Acceptance criteria

- Pure function is exported from `agent-launcher-pure.ts`.
- All 5 unit tests pass.
- Function has no side effects, no I/O, no signal access.

---

## Step 3: Wire launch dir into the agent launcher controller and prompt preview

### Files to modify

- `src/components/launcher/agent-launcher-controller.ts`
- `src/components/launcher/prompt-preview-controller.ts`
- `src/components/launcher/prompt-preview-controller.test.ts`

### What to do

#### 3a: Add agentWorktreeDir to AgentLauncherDeps

In `agent-launcher-controller.ts`, add `agentWorktreeDir: string` to `AgentLauncherDeps`.

#### 3b: Compute launchDir as a reactive memo in the controller

```typescript
const launchDir = createMemo(() => computeLaunchDir({
  useWorktree: props.useWorktree,
  projectPath: props.projectPath,
  worktreeRootPath: props.config?.worktreeRootPath ?? null,
  agentWorktreeDir: props.agentWorktreeDir,
  folderName: props.ticket().folderName,
}));
```

Expose `launchDir` in the returned controller object.

#### 3c: Pass launchDir into the LaunchRequest

In the `launchAgent` and `pullAndRetry` functions, add `launchDir: launchDir()` to the LaunchRequest object.

#### 3d: Wire launchDir into prompt preview

Add `launchDir: () => string` to `PromptPreviewDeps`. In the controller that creates the preview, pass `launchDir`.

In `prompt-preview-controller.ts`, add `launchDir: deps.launchDir()` to the `variables` object in `generatedPrompt`.

#### 3e: Update prompt preview test

Add a test that verifies `{{launchDir}}` is interpolated in the prompt preview.

### Acceptance criteria

- `launchDir` is a reactive memo on the controller, derived from `useWorktree`, `projectPath`, `worktreeRootPath`, `agentWorktreeDir`, and `folderName`.
- LaunchRequest objects include `launchDir`.
- `{{launchDir}}` is interpolated in the prompt preview.
- Prompt preview test verifies launchDir interpolation.
- Existing prompt preview tests still pass.

---

## Step 4: Add launchDir to LaunchRequest and update server launch paths

### Files to modify

- `src/core/launcher/agent-launch.ts`
- `src/components/launcher/launcher-api.ts`
- `src/core/launcher/agent-launch.test.ts`

### What to do

#### 4a: Add launchDir to LaunchRequest

In `agent-launch.ts`:

```typescript
export interface LaunchRequest {
  initialPrompt: string;
  useWorktree: boolean;
  profileName: string;
  force: boolean;
  launchDir: string;  // <-- new
}
```

Update `parseLaunchRequest` to extract `launchDir` (string, default `""`).

#### 4b: Update launchAgentAction

In `launcher-api.ts`, `launchAgentAction` currently calls `resolveLaunchDir` to compute the path server-side. Change it to use `launchRequest.launchDir` as the authoritative path, but still call `resolveLaunchDir` for the dirty/behind-remote checks when `useWorktree` is true.

Actually, looking more carefully at what `resolveLaunchDir` does:
1. If `useWorktree` is false, return projectPath.
2. If `useWorktree` is true, call `ensureAgentWorktree` which:
   a. Checks dirty/behind-remote status.
   b. Creates the worktree if needed.
   c. Returns the worktree path.

The key insight is that the server still needs `ensureAgentWorktree` to create the worktree and check dirty/behind-remote. But instead of using the path that `ensureAgentWorktree` computes internally, we pass `launchRequest.launchDir` as the target path.

Approach: Modify `resolveLaunchDir` to accept an explicit `targetPath` parameter. When provided, pass it through to `ensureAgentWorktree` (which will need to accept an optional target path override too). OR, simpler: keep `resolveLaunchDir` for the checks only, then use `launchRequest.launchDir` as the final launch directory.

Simplest approach: change `launchAgentAction` to:
1. If `useWorktree` is true, call `resolveLaunchDir` for dirty/behind-remote checks and worktree creation. But then use `launchRequest.launchDir` instead of `resolved.launchDir`.
2. If `useWorktree` is false, skip `resolveLaunchDir`, use `launchRequest.launchDir` directly.

Wait -- `resolveLaunchDir` also calls `ensureAgentWorktree` which creates the worktree. The worktree path is computed inside `ensureAgentWorktree` from the folderName. Since the client uses the same `worktreeFolderName` function, the paths will match. So we can safely use the client-provided `launchDir` as the authoritative path.

Revised approach: Replace the final `resolved.launchDir` usage with `launchRequest.launchDir` in all three launch paths. The server still runs `resolveLaunchDir` / `ensureAgentWorktree` for side effects (worktree creation + checks), but the returned path is discarded in favor of the client-provided one.

Changes in `launchAgentAction`:
```typescript
const resolved = await resolveLaunchDir(...);
if (!resolved.ok) return ...;
// Use launchRequest.launchDir instead of resolved.launchDir
await launchAgentCore(projectSlug, ticket, launchRequest, launchRequest.launchDir);
```

#### 4c: Update pullAndRetryLaunch

Same pattern: after `ensureAgentWorktree` succeeds, use `launchRequest.launchDir` instead of `worktreeResult.worktreePath`.

```typescript
await launchAgentCore(projectSlug, ticket, launchRequest, launchRequest.launchDir);
```

#### 4d: Update runShortcut

`runShortcut` in `launcher-api.ts` currently takes `(projectSlug, folderName, name, useWorktree, force)`. Per the PRD: "The shortcut launch endpoint currently accepts useWorktree and force as separate parameters (not part of LaunchRequest). It will need a launchDir parameter added in the same style."

Add `launchDir: string` parameter to `runShortcut`:

```typescript
export async function runShortcut(
  projectSlug: string, folderName: string,
  name: string, useWorktree: boolean, force: boolean, launchDir: string,
) {
```

Then use `launchDir` instead of `resolved.launchDir` for the `interpolateCommand` call and `spawnDetached` cwd.

The server still calls `resolveLaunchDir` for worktree creation and dirty checks, but uses the client-provided `launchDir` for the actual command execution.

#### 4e: Update agent-launch.test.ts

Update the `parseLaunchRequest` replicated function and tests to include `launchDir`.

### Acceptance criteria

- `LaunchRequest` has `launchDir: string`.
- `parseLaunchRequest` extracts `launchDir`.
- `launchAgentAction` uses `launchRequest.launchDir` as the final cwd.
- `pullAndRetryLaunch` uses `launchRequest.launchDir` as the final cwd.
- `runShortcut` accepts `launchDir` and uses it as the final cwd and for interpolation.
- All existing tests pass.

---

## Step 5: Update shortcut state to pass launchDir

### Files to modify

- `src/components/ticket/ticket-detail-shortcuts.ts`
- `src/components/ticket/ticket-detail-state.ts`
- `src/components/ticket/TicketDetailDialog.tsx`

### What to do

#### 5a: Shortcut state needs launchDir

`createShortcutState` calls `runShortcutAction`. The new `runShortcut` signature needs `launchDir`. Add `launchDir: () => string` to `ShortcutDeps`.

```typescript
export interface ShortcutDeps {
  projectSlug: string;
  folderName: () => string;
  useWorktree: () => boolean;
  launchDir: () => string;  // <-- new
  setError: (msg: string) => void;
}
```

In `runShortcut`, pass `deps.launchDir()` to `runShortcutAction`.

#### 5b: Provide launchDir to createShortcutState

In `ticket-detail-state.ts`, `createShortcutState` is called before the launcher controller exists. The launchDir depends on `useWorktree`, `projectPath`, `worktreeRootPath`, `agentWorktreeDir`, and `folderName` -- all of which are available from signals in the ticket-detail-state.

Import `computeLaunchDir` and create the launchDir signal:

```typescript
const shortcuts = createShortcutState({
  projectSlug: props.projectSlug,
  folderName: header.savedFolderName,
  useWorktree,
  launchDir: () => computeLaunchDir({
    useWorktree: useWorktree(),
    projectPath: launcherConfig()?.projectPath ?? "",
    worktreeRootPath: launcherConfig()?.worktreeRootPath ?? null,
    agentWorktreeDir: launcherConfig()?.agentWorktreeDir ?? "",
    folderName: header.savedFolderName(),
  }),
  setError,
});
```

Alternatively, compute it once and share it. Since `TicketDetailDialog.tsx` also needs to pass `agentWorktreeDir` to the launcher controller, consider computing the launchDir in one place and sharing via a signal or memo.

Better approach: create a `launchDir` memo in `ticket-detail-state.ts` that both the shortcut state and the launcher controller can consume. But the launcher controller currently computes its own launchDir internally. To avoid duplication, expose the launchDir from the ticket-detail-state level. However, since the launcher controller already computes launchDir as a memo, and the shortcut state only needs a reactive accessor, we can compute it independently in both places (the pure function is cheap and deterministic).

#### 5c: Pass agentWorktreeDir to launcher deps

In `TicketDetailDialog.tsx`, the `launcherDeps` object is constructed. Add `agentWorktreeDir`:

```typescript
const launcherDeps = {
  ...
  get agentWorktreeDir() { return s.launcherConfig()?.agentWorktreeDir ?? ""; },
};
```

### Acceptance criteria

- Shortcut launch passes client-computed launchDir to the server.
- Launcher controller receives agentWorktreeDir from ticket-detail state.
- No duplication of launchDir computation logic (both use `computeLaunchDir`).

---

## Step 6: Add launch directory display and copy button to the footer UI

### Files to modify

- `src/components/ticket/TicketDetailDialog.tsx`
- `src/components/ticket/ticket-detail-state.ts`

### What to do

#### 6a: Expose launchDir from ticket-detail-state

Add a `launchDir` memo to `createTicketDetailState` and expose it in the return object:

```typescript
const launchDir = createMemo(() => computeLaunchDir({
  useWorktree: useWorktree(),
  projectPath: launcherConfig()?.projectPath ?? "",
  worktreeRootPath: launcherConfig()?.worktreeRootPath ?? null,
  agentWorktreeDir: launcherConfig()?.agentWorktreeDir ?? "",
  folderName: header.savedFolderName(),
}));
```

This is needed in the footer regardless of which tab is active.

Note: the launcher controller also computes its own launchDir from the same inputs. This is acceptable since `computeLaunchDir` is a pure function with no side effects. Both will always produce the same result.

#### 6b: Add UI to footer

In `TicketDetailDialog.tsx`, in the footer div (class `"flex items-center gap-2 border-t border-border px-4 py-3"`), add below the "Launch in worktree" checkbox label:

```tsx
<div class="flex items-center gap-1 text-xs text-muted-foreground" data-testid="launch-dir-display">
  <span class="break-all">{s.launchDir()}</span>
  <button
    type="button"
    class="btn-icon shrink-0"
    data-testid="launch-dir-copy-button"
    onClick={() => navigator.clipboard.writeText(s.launchDir())}
    title="Copy path"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
  </button>
</div>
```

Layout structure of the footer should be:

```
[checkbox: Launch in worktree]
[launch dir text] [copy icon]        [Run button] [Save button] [Close button]
```

The launch dir line sits below the checkbox. Restructure the footer:

```tsx
<div class="border-t border-border px-4 py-3">
  <div class="flex items-center gap-2">
    <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <input type="checkbox" ... />
      Launch in worktree
    </label>
    <div class="flex-1" />
    {/* buttons */}
  </div>
  <div class="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid="launch-dir-display">
    <span class="break-all">{s.launchDir()}</span>
    <button ... copy button ... />
  </div>
</div>
```

The launch dir text wraps naturally (no truncation). `break-all` ensures long paths wrap at any character.

### Acceptance criteria

- A muted text line below the "Launch in worktree" checkbox shows the full path.
- A copy icon button beside the path copies it to clipboard.
- Path wraps naturally, no truncation.
- When useWorktree is off: shows projectPath.
- When useWorktree is on: shows worktreeRootPath/worktreeFolderName(folderName).
- Path updates reactively when the toggle changes.
- `data-testid="launch-dir-display"` and `data-testid="launch-dir-copy-button"` are present for testing.

---

## Step 7: Update tests

### Files to modify

- `src/core/launcher/agent-launch.test.ts` -- update parseLaunchRequest tests for launchDir field
- `src/components/launcher/agent-launcher-pure.test.ts` -- add computeLaunchDir tests (step 2)
- `src/components/launcher/prompt-preview-controller.test.ts` -- add launchDir interpolation test (step 3e)
- `e2e/ticket-detail-launcher-tab.test.ts` -- add e2e test for launch dir display

### E2E tests to add

Add to `ticket-detail-launcher-tab.test.ts`:

```
it("launch dir display shows project path when worktree is off")
  - Create project with ticket (useWorktree: false).
  - Open launcher tab.
  - Assert `[data-testid="launch-dir-display"]` text contains the project path.

it("launch dir display updates when worktree toggle changes")
  - Create project with ticket (useWorktree: false), worktreeRootPath set.
  - Open launcher tab.
  - Check the worktree checkbox.
  - Assert launch-dir-display text contains the worktreeRootPath and folder name.
  - Uncheck the checkbox.
  - Assert launch-dir-display text contains the project path again.

it("prompt preview interpolates {{launchDir}} placeholder")
  - Create project with template text containing {{launchDir}}.
  - Open launcher tab.
  - Assert the preview contains the project path (useWorktree off by default).
```

### Acceptance criteria

- All unit tests pass.
- All e2e tests pass.
- No regressions.

---

## Step 8: Update the agent-launch spec

### Files to modify

- `spec/agent-launch.md`

### What to do

Update the spec to reflect:

- Under "Resolve launch directory": note that the client computes the launch directory and sends it as `launchDir` in the request. The server uses the client-provided path for launching.
- Under "Prompt preview": add that `{{launchDir}}` is interpolated using the client-computed launch directory.

### Acceptance criteria

- Spec reflects the new client-computed launch dir behavior.
- Spec mentions `{{launchDir}}` placeholder interpolation.

---

## Dependency graph

```
Step 1 (expose agentWorktreeDir) -- no deps
Step 2 (pure computeLaunchDir)   -- no deps

Step 3 (controller + preview) -- depends on Steps 1, 2
Step 4 (LaunchRequest + server) -- depends on Step 2

Step 5 (shortcuts) -- depends on Steps 2, 4
Step 6 (UI) -- depends on Steps 1, 2, 3

Step 7 (tests) -- depends on Steps 1-6
Step 8 (spec) -- depends on Steps 1-6
```

Steps 1 and 2 can be done in parallel.
Steps 3 and 4 can be done in parallel (after 1+2).
Steps 5 and 6 can be done in parallel (after 3+4).
Steps 7 and 8 come last.

In practice, doing it sequentially 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 is safest and avoids merge conflicts within the same file.

---

## Edge cases

1. Config not yet loaded: `launcherConfig()` is null on first render. `computeLaunchDir` receives empty strings for projectPath and agentWorktreeDir. The display shows an empty path momentarily. Once config loads, the reactive memo updates. This is acceptable and matches existing behavior (the launcher shows "Loading config..." while null).

2. Very long folder names: `worktreeFolderName` truncates to 50 characters. The displayed path will show the truncated name. This matches what the server actually creates.

3. worktreeRootPath is empty string vs null: The merged config normalizes empty strings to null during save (see `saveWorktreeRootPath`). The pure function handles null correctly.

4. Path separators on Windows: `computeLaunchDir` uses forward slashes. This is consistent with the existing ticketDir computation in prompt-preview-controller.ts. The server normalizes paths when needed.

5. Clipboard API unavailable: `navigator.clipboard.writeText` may fail in non-secure contexts. The button should wrap the call in a try/catch and handle gracefully.

6. LaunchRequest.launchDir is empty: If the client sends an empty launchDir (e.g., due to a bug), the server should throw an error rather than using an empty cwd. Add a guard in `launchAgentAction`: `if (!launchRequest.launchDir) throw new ValidationError("launchDir is required")`.

---

## Validation checklist

After all steps:

- [ ] `npm run test:all` passes (tsc + unit + build + e2e)
- [ ] Launch dir display appears below the worktree checkbox
- [ ] Toggling useWorktree updates the displayed path
- [ ] Copy button copies the path to clipboard
- [ ] `{{launchDir}}` is interpolated in prompt preview
- [ ] Agent launch still works (sends launchDir in request, server uses it)
- [ ] Shortcut launch still works (sends launchDir in request, server uses it)
- [ ] Pull-and-retry launch still works
- [ ] Force launch (dirty worktree) still works
- [ ] No z-index usage in new UI (per CLAUDE.md)
- [ ] No bare "slug" variable names (per CLAUDE.md)
- [ ] No Co-Authored-By lines in commits (per CLAUDE.md)
- [ ] No empty catch blocks (per CLAUDE.md)
