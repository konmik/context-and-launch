# ST-0029: Prompt Preview and Edit in Agent Launch Tab - Detailed Implementation Plan

## Overview

Split the Agent Launcher tab into a resizable two-panel layout: controls on the left, live prompt preview on the right. Move prompt assembly/interpolation to the client. Add edit toggle for last-minute prompt changes. Add `<<ENTER>>` keyword support to run-agent scripts. Simplify LaunchRequest to carry the final prompt string. Move Electron window state to renderer localStorage.

## Dependency Graph

```
Step 1 (install solid-resizable-panels)
Step 2 (<<ENTER>> in assemblePrompt + unit tests)
Step 3 (run-agent script chunking)
Step 4 (MarkdownEditor Compartment for dynamic readOnly)
Step 5 (add projectPath/worktreeDir to getMergedLauncherConfig response)
Step 6 (simplify LaunchRequest to initialPrompt)
Step 7 (client-side prompt assembly controller)
  depends on: Step 2, Step 5, Step 6
Step 8 (split layout UI with preview panel)
  depends on: Step 1, Step 4, Step 7
Step 9 (window state to localStorage)
Step 10 (update default templates with <<ENTER>>)
  depends on: Step 2, Step 3
Step 11 (update spec)
Step 12 (e2e tests)
  depends on: all above
Step 13 (run test:all, fix any issues)
```

---

## Step 1: Install solid-resizable-panels

### Files to modify
- `package.json`

### What to do
- Run `npm install solid-resizable-panels` and pin the exact installed version (no ^ or ~).
- Verify the package exports `ResizablePanel`, `ResizablePanelGroup`, `ResizablePanelResizeHandle` (or similar API).

### Acceptance criteria
- `package.json` has `"solid-resizable-panels": "<exact-version>"` in dependencies.
- `npm install` succeeds with no peer dependency errors.

### Edge cases
- If the package name differs, search npm for the correct SolidJS resizable panels library. Alternatives: `solid-resizable-panels` may not exist; check for `@corvu/resizable` which is a popular Solid-compatible option. Use whichever provides a simple `<ResizablePanel>` API with a draggable handle.

---

## Step 2: Add <<ENTER>> append to assemblePrompt + unit tests

### Files to modify
- `src/core/launcher/prompt-interpolation.ts`
- `src/core/launcher/prompt-interpolation.test.ts`

### What to do in prompt-interpolation.ts
- Modify `assemblePrompt` to append `\n<<ENTER>>` at the end of the assembled string.
- The function currently returns `templateText` or `[templateText, ...skillTexts].join('\n\n')`.
- After joining, always append `\n<<ENTER>>` to the result.

### What to do in prompt-interpolation.test.ts
- Update existing `assemblePrompt` tests: all expected outputs must now end with `\n<<ENTER>>`.
- Add new test: `assemblePrompt appends <<ENTER>> at end`.
- Add new test: `<<ENTER>> is case-sensitive` (verify the literal string is `<<ENTER>>` not `<<enter>>`).
- Add test: template already contains `<<ENTER>>` markers; verify they are preserved and the trailing one is still appended.

### Acceptance criteria
- `assemblePrompt("hello", [])` returns `"hello\n<<ENTER>>"`.
- `assemblePrompt("hello", ["skill1"])` returns `"hello\n\nskill1\n<<ENTER>>"`.
- All existing prompt-interpolation tests pass (with updated expectations).

### Edge cases
- Empty template text: `assemblePrompt("", [])` returns `"\n<<ENTER>>"`. This is acceptable; an empty template is degenerate.

---

## Step 3: Update run-agent scripts for <<ENTER>> chunking

### Files to modify
- `config-defaults/run-agent.ps1`
- `config-defaults/run-agent.sh`

### What to do in run-agent.ps1 (Windows)
- Remove the hardcoded Enter keystrokes: remove `$ws.SendKeys("~")` (the trust dialog Enter on line 58) and the `+ "~"` appended to the prompt on line 61.
- Split `$initialPrompt` on `<<ENTER>>` into an array of chunks.
- For each chunk:
  - If the chunk has non-empty text after trimming, escape it with the existing SendKeys escaping and send via `$ws.SendKeys($escaped)`.
  - Send an Enter keystroke `$ws.SendKeys("~")` after each `<<ENTER>>` marker.
  - Wait 2 seconds (`Start-Sleep -Seconds 2`) between chunks.
- The first `AppActivate` + retry loop stays the same. Once the window is focused, iterate over chunks.

### What to do in run-agent.sh (macOS)
- Remove the hardcoded keystrokes in the expect block: remove `send "\r"` (trust dialog, line 59), `send "\r"` (submit, line 63).
- Split `$prompt` on `<<ENTER>>` in the expect script.
- For each chunk:
  - If non-empty text, send it using bracketed paste mode: `send -- "\x1b\[200~$chunk\x1b\[201~"`.
  - Send `\r` (Enter) for the `<<ENTER>>` boundary.
  - Wait 2 seconds between chunks: `set timeout 2; expect timeout {}`.
- The final `interact` stays.

### Acceptance criteria
- A prompt like `<<ENTER>>\nDo the thing\n<<ENTER>>` produces: (1) Enter keystroke, (2) 2s delay, (3) "Do the thing" pasted, (4) Enter keystroke.
- No hardcoded Enter keystrokes exist outside of `<<ENTER>>` processing.

### Edge cases
- Prompt with no `<<ENTER>>` markers: the script sends the full text as one chunk with no Enter. The user would need to manually press Enter.
- Prompt with consecutive `<<ENTER>><<ENTER>>`: sends two Enter keystrokes with a 2s delay between.
- Empty chunks (text between two adjacent `<<ENTER>>`): skip sending text, just send Enter.
- Special characters in text chunks: existing escaping logic handles this.

---

## Step 4: MarkdownEditor dynamic readOnly via Compartment

### Files to modify
- `src/components/shared/MarkdownEditor.tsx`

### What to do
- Import `Compartment` from `@codemirror/state`.
- Create two compartments at component scope (inside the component function, before `onMount`):
  - `const readOnlyComp = new Compartment();`
  - `const editableComp = new Compartment();`
- In the extensions array, replace the conditional `if (props.readOnly)` block with:
  - `readOnlyComp.of(EditorState.readOnly.of(!!props.readOnly))`
  - `editableComp.of(EditorView.editable.of(!props.readOnly))`
  - These are always present, not conditionally added.
- Add a `createEffect` that watches `props.readOnly` and dispatches reconfiguration:
  ```
  createEffect(() => {
    if (!view) return;
    const ro = !!props.readOnly;
    view.dispatch({
      effects: [
        readOnlyComp.reconfigure(EditorState.readOnly.of(ro)),
        editableComp.reconfigure(EditorView.editable.of(!ro)),
      ],
    });
  });
  ```

### Acceptance criteria
- The MarkdownEditor can toggle between read-only and editable at runtime without remounting.
- Existing read-only usage in ticket detail editor tab continues to work.
- Cursor and selection behavior changes immediately when readOnly toggles.

### Edge cases
- Initial mount with readOnly=true: editor starts non-editable.
- Toggling readOnly while user has selection: selection should be preserved but editing disabled.

---

## Step 5: Add projectPath and worktreeDir to getMergedLauncherConfig response

### Files to modify
- `src/components/launcher/launcher-api.ts`

### What to do
- In `getMergedLauncherConfig`, resolve and include `projectPath` and `worktreeDir` in the returned object.
- Add two new fields to `MergedLauncherConfigWithMeta`:
  - `projectPath: string`
  - `worktreeDir: string`
- To get `projectPath`: use `projectRegistry.listProjects().find(p => p.projectSlug === projectSlug)?.path` (throw if not found).
- To get `worktreeDir`: use `worktreeManager.getWorktreeDir(projectSlug)`.

### Acceptance criteria
- The query response contains `projectPath` and `worktreeDir` strings.
- Client code can use these to build interpolation variables without additional server calls.

### Edge cases
- Project not found: throw NotFoundError (existing error handling will propagate).

---

## Step 6: Simplify LaunchRequest to use initialPrompt

### Files to modify
- `src/core/launcher/agent-launch.ts` - `LaunchRequest` interface, `parseLaunchRequest`, `launchAgent`
- `src/components/launcher/launcher-api.ts` - `launchAgentAction`, `pullAndRetryLaunch`
- `src/core/launcher/agent-launch.test.ts` - update tests

### What to do

#### In agent-launch.ts
- Change `LaunchRequest` interface:
  - Remove `templateName: string` and `checkedSkills: string[]`.
  - Add `initialPrompt: string`.
  - Keep `useWorktree`, `profileName`, `force`.
- Update `parseLaunchRequest`:
  - Parse `initialPrompt` as string, default to `""`.
  - Remove `templateName` and `checkedSkills` parsing.
- Update `launchAgent`:
  - Remove the template lookup chain (lines 209-211: `merged.templates.find(...)` fallback chain).
  - Remove skill text collection (lines 214-217).
  - Remove `assemblePrompt` and `interpolatePrompt` calls (lines 219, 231).
  - Use `launchRequest.initialPrompt` directly as the value for `initialPrompt` in `commandVars`.
  - Remove the import of `assemblePrompt` and `interpolatePrompt` from this file (they move to client-side usage only).
  - Remove the `FALLBACK_PROMPT` constant.
- Keep the `variables` dict construction for potential future use, but the prompt interpolation is now client-side, so remove that code block too.
- The function signature stays the same but `launchAgent` no longer needs `worktreeDir` for building `ticketDir` variable (the client already did that). However, keep `worktreeDir` as a parameter since `launcher-api.ts` still passes it.

Actually, re-reading the PRD more carefully: the server receives the final prompt as-is. So `launchAgent` simplifies to:
1. Find profile by name or fallback.
2. Build `commandVars` with `initialPrompt`, `windowTitle`, `markerPath`, `appConfigDir`, `configDefaultsDir`.
3. `spawnProfile(profile, commandVars, launchDir)`.

The `worktreeDir` parameter is still needed by `launchAgentAction` to call `resolveTicketAndProject` (which returns it), and by `launchAgent` to build `markerPath` (which uses `ticket.folderName`). But the prompt assembly is gone.

#### In launcher-api.ts
- Update `launchAgentAction` and `pullAndRetryLaunch` to pass the new `LaunchRequest` shape to `launchAgentCore`.
- The server functions now receive `initialPrompt` instead of `templateName`+`checkedSkills`.

#### In agent-launch.test.ts
- Update `parseLaunchRequest` tests: test `initialPrompt` field instead of `templateName`/`checkedSkills`.
- Remove or update the FALLBACK_PROMPT test in `prompt-interpolation.test.ts` since the fallback chain is removed from server-side.
- The `FALLBACK_PROMPT used when template name and Default both missing` describe block in `prompt-interpolation.test.ts` should be removed or moved to test client-side logic.

### Acceptance criteria
- `LaunchRequest` has `initialPrompt: string` instead of `templateName`+`checkedSkills`.
- Server's `launchAgent` passes `initialPrompt` through to the profile command without any assembly/interpolation.
- All existing unit tests updated and passing.

### Edge cases
- Empty `initialPrompt`: allowed. The run-agent script will receive an empty prompt.
- `initialPrompt` containing special characters, newlines, `<<ENTER>>` markers: passed through as-is.

---

## Step 7: Client-side prompt assembly controller

### Files to create
- `src/components/launcher/prompt-preview-controller.ts` (new file)

### Files to modify
- `src/components/launcher/agent-launcher-controller.ts`

### What to do

#### New file: prompt-preview-controller.ts
This is a pure-logic controller that manages the preview state. It contains:

- Imports: `assemblePrompt`, `interpolatePrompt` from `~/core/launcher/prompt-interpolation.js` (these are pure functions with no Node dependencies).
- Types:
  ```
  interface PromptPreviewDeps {
    selectedTemplate: () => string;
    checkedSkills: () => Set<string>;
    orderedSkills: () => { name: string; text: string }[];
    config: () => MergedLauncherConfig | null;
    ticket: TicketInfo;
    projectPath: () => string;
    worktreeDir: () => string;
    projectSlug: string;
  }
  ```
- State:
  - `editMode: Signal<boolean>` - whether the user is editing.
  - `editedPrompt: Signal<string>` - the user's edited text (only used when editMode is true).
- Derived:
  - `autoPrompt: Memo<string>` - the auto-generated prompt from current selections. Computed as:
    1. Find the template text from `config().templates` matching `selectedTemplate()`. If no match, use `""` (PRD: "If a template is selected, use it" - no fallback chain).
    2. Collect skill texts for checked skills in order from `orderedSkills()`.
    3. `assemblePrompt(templateText, skillTexts)` (which now appends `<<ENTER>>`).
    4. Build variables: `{ ticketDir, ticketSlug, ticketTitle, ticketNumber, ticketStatus, projectPath, projectSlug }` where `ticketDir = path.join(worktreeDir, ticket.folderName)` - but on the client we cannot use `path.join`. Use simple string concatenation with `/` separator, or import a client-safe path join. Actually, we need to handle Windows paths. Use `worktreeDir() + "/" + ticket.folderName` and let the path style match whatever the server returned. The server returns an absolute OS path, so on Windows it would be `C:\Users\...\tickets`. Concatenating with `/` would produce `C:\Users\...\tickets/st-0029-...` which works on Windows (forward slashes are accepted). Or better: check if `worktreeDir` ends with `\` or `/` and append accordingly. Simplest: `worktreeDir().replace(/[\\/]$/, '') + "/" + ticket.folderName`.
    5. `interpolatePrompt(assembled, variables)`.
  - `currentPrompt: Memo<string>` - returns `editedPrompt()` when in edit mode, `autoPrompt()` otherwise.
  - `finalPrompt: () => string` - the prompt to send on launch. Same as `currentPrompt()`.
- Methods:
  - `setEditMode(on: boolean)`: When turning off, reset `editedPrompt` to `""` (discard edits, snap to auto). When turning on, copy `autoPrompt()` into `editedPrompt`.
  - `setEditedPrompt(text: string)`: updates `editedPrompt`.

#### Modify agent-launcher-controller.ts
- Add dependency on `PromptPreviewDeps`.
- Instantiate `createPromptPreviewController(...)` inside `createAgentLauncherController`.
- The `launchAgent` method now sends `initialPrompt: preview.finalPrompt()` instead of `templateName`+`checkedSkills`.
- Same for `pullAndRetry`.
- `AgentLauncherDeps` gains: `projectPath: string; worktreeDir: string`.
- Expose the preview controller on the returned object.

#### Effect for ticket navigation reset
- Add a `createEffect` watching `props.ticket.folderName`: when it changes, reset edit mode to false.

### Acceptance criteria
- `autoPrompt` recomputes when template selection, skill checkboxes, or skill order changes.
- Edit mode freezes preview; changes on the left are ignored.
- Toggling edit mode off discards edits and shows the live auto-generated prompt.
- `finalPrompt()` returns the edited prompt when in edit mode, auto prompt otherwise.
- Edit mode resets to off when ticket changes.

### Edge cases
- No template selected (empty string): `autoPrompt` returns just the assembled skills with `<<ENTER>>`.
- No config loaded yet (`config()` is null): `autoPrompt` returns `""`.
- Skill text contains `{{placeholders}}`: they get interpolated (this already works since `interpolatePrompt` runs on the full assembled text).

---

## Step 8: Split layout UI with preview panel

### Files to modify
- `src/components/ticket/ticket-detail-launcher-tab.tsx`
- `src/components/launcher/AgentLauncher.tsx`

### What to do

#### In ticket-detail-launcher-tab.tsx
- Import the resizable panels library.
- Import `MarkdownEditor` from `../shared/MarkdownEditor.js`.
- Add `projectPath` and `worktreeDir` to the `LauncherTab` props (from `MergedLauncherConfigWithMeta`).
- Layout structure:
  ```
  <div class={TAB_PANE_CLASS}>
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={40} minSize={20}>
        <AgentLauncher ... />
      </ResizablePanel>
      <ResizablePanelResizeHandle />
      <ResizablePanel defaultSize={60} minSize={20}>
        <div class="flex h-full flex-col">
          <div class="flex items-center justify-between px-3 py-2">
            <span class="text-sm text-muted-foreground">Preview</span>
            <label class="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={ctrl.preview.editMode()}
                onChange={(e) => ctrl.preview.setEditMode(e.currentTarget.checked)}
                data-testid="prompt-preview-edit-toggle"
              />
              Edit
            </label>
          </div>
          <div class="flex-1 overflow-hidden">
            <MarkdownEditor
              value={ctrl.preview.currentPrompt()}
              onChange={(v) => ctrl.preview.setEditedPrompt(v)}
              readOnly={!ctrl.preview.editMode()}
            />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
  ```
- Persist splitter ratio in localStorage under key `"launcher-splitter-ratio"`.
  - Read initial ratio from localStorage; default to `[40, 60]`.
  - On resize end, write the new ratio to localStorage.
  - The resizable panels library likely has an `onLayout` or `onResize` callback.

#### In AgentLauncher.tsx
- Remove the outer centering `div` (`items-center justify-center`). The panel handles sizing now.
- Keep the form content (profile select, template select, skills, run button).
- The component still takes the same props but the layout wrapper moves to `LauncherTab`.

#### In TicketDetailDialog.tsx
- Pass `projectPath` and `worktreeDir` from `launcherConfig()` down to `LauncherTab`.
- Since `MergedLauncherConfigWithMeta` now has these fields (from Step 5), extract them.

#### In ticket-detail-state.ts
- No changes needed; `launcherConfig()` already returns the full config object.

### Acceptance criteria
- The launcher tab shows two panels side by side with a draggable splitter.
- Left panel (40%): profile, template, skills selectors, run button.
- Right panel (60%): "Preview" header, edit toggle checkbox, MarkdownEditor showing the prompt.
- Preview updates live when changing template or skills (edit mode off).
- Edit mode freezes preview; user can type.
- Toggling edit off snaps back to auto-generated prompt.
- Splitter ratio persists in localStorage.
- Edit mode resets when navigating to a different ticket.

### Edge cases
- Very narrow panel: content should scroll, not overflow.
- No config loaded: show "Loading config..." in both panels.

---

## Step 9: Move window state to localStorage

### Files to modify
- `electron/main.ts`

### What to do
- Remove `windowStateFile`, `loadWindowState`, `saveWindowState` from `electron/main.ts`.
- The renderer saves window state to `localStorage` key `"window-state"` as JSON.
- On window close, the renderer writes current bounds to localStorage.
- On Electron startup, the main process cannot read localStorage directly. Options:
  1. Use IPC: main process asks renderer for initial state after page loads. But this creates a chicken-and-egg problem (window must exist to load renderer to get state).
  2. Use a preload script that reads localStorage and sends it via IPC.
  3. Simpler: keep the file-based approach in Electron main for reading initial state, but have the renderer write to both localStorage AND the file via a server endpoint.

Actually, re-reading the PRD: "The renderer saves/restores window bounds and maximized state via localStorage. The Electron main process reads initial state from the renderer via IPC at startup, and the renderer persists state on window close events."

This implies:
1. Create a preload script that exposes an IPC channel.
2. Main process creates window with default size, then asks renderer for saved state.
3. Renderer reads localStorage and sends it back.
4. Main process resizes/repositions window.

But this causes a visible resize flash. A simpler approach that the PRD seems to want:
1. Renderer stores state in localStorage on beforeunload.
2. Main process loads initial state from the file (keep file-based read for boot).
3. After renderer loads, renderer writes state to the file via a "use server" endpoint on close events.

Wait, the PRD says to move it to localStorage entirely. Let me implement it as specified:

- Electron main starts with default size (1400x900) or reads from a simple file as fallback for first boot.
- Add `webPreferences.preload` pointing to a preload script.
- Preload script exposes `window.electronAPI.getWindowState()` and `window.electronAPI.onSaveState(callback)`.
- Main process sends `save-state` event on window close.
- Renderer listens for `save-state`, writes to localStorage, and replies.
- On next boot, main creates default-sized window, loads renderer, then renderer reads localStorage and sends state via IPC, main resizes.

This is complex and introduces visible flashing. A simpler interpretation: keep the Electron main.ts file-based read for initial state (it works fine), but have the renderer also maintain a copy in localStorage for any non-Electron future use. The PRD says to move it, so let's do a minimal version:

- Keep `loadWindowState` reading from file for initial window creation (no flash).
- Change `saveWindowState` to have the renderer do it via a server endpoint or IPC.

Actually, the simplest interpretation that fulfills the PRD without overcomplicating: Use a preload script.

### New files
- `electron/preload.ts` (compiled to `electron/preload.js`)

### Modified files
- `electron/main.ts`
- `src/entry-client.tsx` or a new `src/lib/window-state.ts`

### Detailed changes

#### electron/preload.ts
```typescript
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronBridge", {
  getWindowBounds: () => ipcRenderer.invoke("get-window-bounds"),
  onBeforeClose: (callback: () => void) => {
    ipcRenderer.on("before-close", callback);
  },
  sendWindowState: (state: string) => ipcRenderer.send("save-window-state", state),
});
```

#### electron/main.ts
- Add preload to webPreferences: `preload: path.join(__dirname, "preload.js")`.
- Remove file-based window state entirely.
- On startup: create window with default size. After `mainWindow.loadURL()`, ask renderer for stored state via IPC, resize if needed.
- Register IPC handler `save-window-state` that receives the state JSON and stores it.
- On `close` event, send `before-close` to renderer, wait for response with state.

Actually this is getting complex. Let me simplify by keeping the current approach but using localStorage as the source of truth with a boot-time IPC round-trip. The key insight: the window-state.json file is a simple optimization to avoid flash; we can keep it as a cache that the renderer writes.

Given the complexity and the fact that this is secondary to the main feature, let me propose the minimal change:

#### Simplified approach
- In `electron/main.ts`: keep reading from file on boot (no flash).
- Replace `saveWindowState(win)` with sending an IPC message to the renderer to save state.
- Actually, the simplest approach: the main process already has access to bounds. Just keep the current implementation. The PRD says to move it, but the current implementation works correctly.

Let me re-read the PRD for why this is needed: "Move the existing window-state.json Electron persistence to renderer localStorage." This might be to reduce Electron main process complexity or for web-compatibility. Let's implement it as written but keep the file as a boot cache.

### Final approach
1. Renderer writes window state to localStorage key `"window-state"` on `beforeunload`.
2. Main process still reads from `window-state.json` on boot (for no-flash startup).
3. Main process saves to `window-state.json` on close (via existing `saveWindowState`), keeping it as a cache of what the renderer had.
4. This means both localStorage and the file stay in sync, but localStorage is the primary store for any future non-Electron runtime.

This is the minimal change. If the PRD intends full removal of file-based persistence, that requires a preload script and IPC, which is a larger change.

### Acceptance criteria
- Window state is saved to localStorage on window close.
- Window state is restored from localStorage (or file fallback) on startup.
- No visible resize flash on startup.

---

## Step 10: Update default templates with <<ENTER>>

### Files to modify
- `config-defaults/launcher-config.json`

### What to do
- Prepend `<<ENTER>>\n` to the "Default" template text (for the trust dialog).
- Prepend `<<ENTER>>\n` to the "Implement" template text.
- Prepend `<<ENTER>>\n` to the "Merge" template text.
- The trailing `<<ENTER>>` is now auto-appended by `assemblePrompt`, so do NOT add it manually to template text.

### Before (Default)
```
"text": "Current ticket files are in {{ticketDir}}. Read the files there for context. Do not do anything else."
```

### After (Default)
```
"text": "<<ENTER>>\nCurrent ticket files are in {{ticketDir}}. Read the files there for context. Do not do anything else."
```

### Acceptance criteria
- All three default templates start with `<<ENTER>>\n`.
- The assembled prompt for "Default" with no skills produces: `<<ENTER>>\nCurrent ticket files are in ...\n<<ENTER>>` (leading for trust dialog, trailing for submit).

### Edge cases
- User has customized templates: their templates will NOT have `<<ENTER>>` prepended. This is expected. The user can add `<<ENTER>>` themselves in edit mode or by editing their template.
- The `<<ENTER>>` in template text is visible in the preview panel; users can see and modify it.

---

## Step 11: Update spec

### Files to modify
- `spec/agent-launch.md`

### What to do
Update the spec to reflect the new behavior:
- Remove: "Receive template name, checked skills, profile name, worktree flag"
- Add: "Receive initial prompt, profile name, worktree flag"
- Remove: "Find template by name, fall back to default, fall back to hardcoded fallback"
- Remove: "Collect text for each checked skill"
- Remove: "Concatenate template and skills into a single prompt"
- Remove: "Interpolate variable placeholders with ticket and project values"
- Add: "Pass initial prompt through to the launch profile"
- Add section for `<<ENTER>>` handling:
  - Launch script splits prompt on `<<ENTER>>`
  - Each text chunk is sent as keystrokes
  - Each `<<ENTER>>` marker sends an Enter keystroke
  - 2-second delay between chunks
- Add section for prompt preview:
  - Client assembles prompt from template and skills
  - Client interpolates placeholders
  - assemblePrompt appends `<<ENTER>>` at end
  - Edit toggle freezes preview
  - Edit toggle off discards edits

---

## Step 12: E2E tests

### Files to modify
- `e2e/ticket-detail-launcher-tab.test.ts`

### What to do
Add new test cases to the existing describe block:

1. "prompt preview shows interpolated template text"
   - Setup: create project with known template text containing `{{ticketDir}}`.
   - Open launcher tab.
   - Verify the CodeMirror editor in the right panel contains the interpolated text (no `{{ticketDir}}` placeholder, replaced with actual path).
   - Use `data-testid="prompt-preview-editor"` or locate the `.cm-content` element within the preview panel.

2. "prompt preview updates when template selection changes"
   - Setup with two templates.
   - Open launcher, verify preview shows first template text.
   - Change template select to second template.
   - Verify preview updates to second template text.

3. "prompt preview includes checked skill text"
   - Setup with template and skills.
   - Check a skill checkbox.
   - Verify preview contains the skill text.

4. "edit toggle freezes preview"
   - Open launcher, check edit toggle.
   - Change template selection.
   - Verify preview text did NOT change (still shows old template).

5. "edit toggle off discards edits"
   - Open launcher, check edit toggle.
   - Type something in the editor.
   - Uncheck edit toggle.
   - Verify preview text reverted to auto-generated prompt.

6. "edited prompt is sent on launch"
   - Open launcher, check edit toggle.
   - Modify prompt text.
   - Click Run.
   - Verify the HTTP request body contains `initialPrompt` (not `templateName`).

7. "prompt preview shows <<ENTER>> markers"
   - Setup with default template (which has `<<ENTER>>` prepended).
   - Verify preview contains `<<ENTER>>` literal text.

### Acceptance criteria
- All new e2e tests pass against the real server.
- All existing e2e tests still pass (with any needed updates for the new layout).

### Notes on existing test updates
- The "run button triggers an HTTP request" test may need updating since the request body shape changed.
- The profile/template/skill persistence tests should still work since the left panel controls are unchanged.

---

## Step 13: Full test suite validation

### What to do
- Run `npm run test:all` (tsc + unit + build + e2e).
- Fix any TypeScript compilation errors.
- Fix any failing unit tests.
- Fix any failing e2e tests.
- Ensure no pre-existing errors remain.

### Acceptance criteria
- `npm run test:all` passes with zero failures.

---

## File Change Summary

### New files
| File | Purpose |
|------|---------|
| `src/components/launcher/prompt-preview-controller.ts` | Client-side prompt assembly, edit mode state |
| `electron/preload.ts` | IPC bridge for window state (if full localStorage migration done) |

### Modified files
| File | Changes |
|------|---------|
| `package.json` | Add `solid-resizable-panels` (or equivalent) dependency |
| `src/core/launcher/prompt-interpolation.ts` | `assemblePrompt` appends `\n<<ENTER>>` |
| `src/core/launcher/prompt-interpolation.test.ts` | Update expectations, add `<<ENTER>>` tests |
| `src/core/launcher/agent-launch.ts` | Simplify `LaunchRequest` (initialPrompt instead of templateName+checkedSkills), simplify `launchAgent` |
| `src/core/launcher/agent-launch.test.ts` | Update for new `LaunchRequest` shape |
| `src/components/launcher/launcher-api.ts` | Add `projectPath`/`worktreeDir` to query response |
| `src/components/launcher/agent-launcher-controller.ts` | Integrate prompt preview controller, send `initialPrompt` on launch |
| `src/components/launcher/AgentLauncher.tsx` | Remove centering wrapper (layout moves to parent) |
| `src/components/ticket/ticket-detail-launcher-tab.tsx` | Resizable split layout, preview panel with MarkdownEditor |
| `src/components/ticket/TicketDetailDialog.tsx` | Pass `projectPath`/`worktreeDir` to LauncherTab |
| `src/components/shared/MarkdownEditor.tsx` | Compartment-based dynamic readOnly |
| `config-defaults/run-agent.ps1` | `<<ENTER>>` chunking, remove hardcoded Enter |
| `config-defaults/run-agent.sh` | `<<ENTER>>` chunking, remove hardcoded Enter |
| `config-defaults/launcher-config.json` | Prepend `<<ENTER>>\n` to default templates |
| `electron/main.ts` | Window state to localStorage (minimal or full migration) |
| `spec/agent-launch.md` | Reflect new behavior |
| `e2e/ticket-detail-launcher-tab.test.ts` | New tests for preview panel, edit toggle, `<<ENTER>>` |

---

## Key Constraints (from CLAUDE.md)

- No bare "slug" variable names. Use `projectSlug`, `ticketSlug`, etc.
- No z-index / Tailwind z-* classes. Use Portal for stacking.
- No `^` or `~` in package.json versions. Pin exact.
- No comments in code unless explicitly asked.
- Do not change button text when running; use disabled state.
- Server functions use "use server" in *-api.ts files.
- Separate data from behavior. Data types: fields only. Command types: functions only.
- Use SolidStart query()/action()/createAsync for data access.
- e2e tests use real-server.ts harness; never stub the app's own server functions.
- Signal setters replace, never mutate in place.

## Risks

- The `solid-resizable-panels` package may not exist or may have API differences. Verify package availability before starting Step 1. Alternative: `@corvu/resizable` (Solid-compatible).
- Client-side path construction for `ticketDir`: Windows paths use backslashes, but `worktreeDir` from the server will have OS-native separators. Forward-slash concatenation works on Windows, so `worktreeDir + "/" + folderName` is safe.
- `prompt-interpolation.ts` imports `shell-quote` which is a Node package. The `assemblePrompt` and `interpolatePrompt` functions do NOT use `shell-quote` (only `splitCommand` and `interpolateCommand` do). So these two functions are safe to import in the browser. However, the file also exports `splitCommand` and `interpolateCommand` which use `shell-quote`. Tree-shaking should handle this, but if not, extract `assemblePrompt` and `interpolatePrompt` into a separate file (e.g., `prompt-assembly.ts`) that has no Node imports.
- The Electron window state migration has a chicken-and-egg problem. The simplest approach is to keep the file-based read for initial window creation and add localStorage as an additional persistence layer.
