## Problem Statement

The Agent Launcher tab shows controls for selecting a template, skills, and profile, but the user cannot see what prompt will actually be sent to the agent. The user has no way to preview the fully interpolated prompt, make last-minute edits, or control when Enter keystrokes are sent during agent initialization. Prompt assembly and interpolation happen server-side, hidden from the user.

## Solution

Split the Agent Launcher tab into a resizable two-panel layout. The left panel keeps the existing controls (template selector, skill checklist, profile selector, run button). The right panel shows a live preview of the fully assembled and interpolated prompt. An edit toggle lets the user modify the prompt before launching. The run-agent scripts gain support for an explicit `<<ENTER>>` keyword that controls when Enter keystrokes are sent, replacing the current hardcoded Enter behavior.

## Implementation Decisions

### Split layout

- Use `solid-resizable-panels` library for the draggable splitter.
- Controls panel on the left, preview panel on the right.
- Default split ratio: 40/60.
- Persist the splitter ratio in localStorage.

### Preview panel

- Header contains a "Preview" label and an edit toggle.
- Uses the existing MarkdownEditor (CodeMirror) component for display and editing.
- When edit mode is off, the preview updates live as the user changes template, skills, or their order on the left.
- When edit mode is on, the preview is frozen and left-side changes are ignored.
- Toggling edit off discards edits and snaps back to the auto-generated prompt.
- Edit mode resets to read-only when navigating between tickets.

### MarkdownEditor dynamic readOnly

- Replace the current mount-time-only readOnly configuration with a CodeMirror Compartment.
- The Compartment allows dispatching `readOnly` and `editable` reconfiguration at runtime without remounting the editor.

### Client-side prompt assembly and interpolation

- Move prompt assembly and interpolation entirely to the client. The pure functions `assemblePrompt` and `interpolatePrompt` have no Node dependencies and run in the browser.
- Add `projectPath` and `worktreeDir` to the `getMergedLauncherConfig` query response so the client has all variables needed for interpolation.
- The controller assembles the prompt from the selected template text and checked skill texts, then interpolates all `{{placeholder}}` variables using client-side data.
- Drop the template fallback chain (selected -> "Default" -> hardcoded). If a template is selected, use it.

### LaunchRequest simplification

- Replace `templateName` and `checkedSkills` fields with a single `initialPrompt` string field.
- Keep `profileName`, `useWorktree`, and `force`.
- The server receives the final prompt as-is and passes it through to the launch profile. No server-side assembly or interpolation.

### <<ENTER>> keyword

- `assemblePrompt` automatically appends `<<ENTER>>` at the end of the assembled string.
- The first `<<ENTER>>` (for the trust dialog) is user-managed content placed in the template text.
- The keyword is case-sensitive.
- The user sees all `<<ENTER>>` markers in the preview and can add, move, or remove them in edit mode.
- The run-agent scripts (both Windows and macOS) split the received prompt on `<<ENTER>>` and send each text chunk separately with a 2-second delay between chunks.
- On macOS, each chunk uses bracketed paste mode. On Windows, each chunk uses SendKeys with special character escaping.
- Remove all hardcoded Enter keystrokes from both scripts. The scripts only send Enter when `<<ENTER>>` markers are present. Fully explicit model.

### Window state to localStorage

- Move the existing window-state.json Electron persistence to renderer localStorage.
- The renderer saves/restores window bounds and maximized state via localStorage. The Electron main process reads initial state from the renderer via IPC at startup, and the renderer persists state on window close events.

## Out of Scope

- Syntax highlighting for `{{placeholders}}` or `<<ENTER>>` markers in the preview editor.
- Configurable delay between `<<ENTER>>` chunks.
- Template management (add/edit/delete) from the preview panel.
- Persisting edited prompt text across sessions or ticket navigation.

## Further Notes

- Existing templates should be updated to include `<<ENTER>>` at the beginning (for the trust dialog) since the hardcoded Enter is being removed. The default template ships with `<<ENTER>>\n` prepended.
- The `<<ENTER>>` append in `assemblePrompt` means every generated prompt ends with a submit action by default. Users who want to review before submitting can remove the trailing `<<ENTER>>` in edit mode.
- All modules require tests: unit tests for assemblePrompt with <<ENTER>> append, client-side interpolation, MarkdownEditor compartment toggle, LaunchRequest changes, and run-agent script chunking logic. E2E tests for the preview panel, edit toggle behavior, and edited prompt being sent on launch.
