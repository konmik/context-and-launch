# ST-0015 Implementation Plan: Coding Agent Profiles

## Overview

Add Coding Agent Profiles to the AI Stages app. A profile is a named command string that controls how Claude is launched. Profiles follow the same dual-scope (app/project) pattern as Templates and Skills. The current hardcoded Windows bat/wt/SendKeys launch mechanism is replaced with profile-based execution backed by user-editable platform scripts.

## Step 1: Data model changes in types.ts

Files to modify:
- `src/types.ts`

What to implement:

1. Add the `LauncherProfile` interface with `name: string` and `command: string`.

2. Add `profiles: LauncherProfile[]` to the `LauncherConfig` interface, alongside `templates` and `skills`.

3. Add `profileName: string | null` to the `LauncherColumnDefaults` interface, alongside `templateName` and `checkedSkills`.

4. Add `profiles: (LauncherProfile & { scope: "app" | "project" })[]` to the `MergedLauncherConfig` interface, alongside the existing `templates` and `skills` arrays.

Dependencies: None.

Acceptance criteria:
- TypeScript compiles with the new types.
- `LauncherProfile` has exactly `name` and `command` fields.
- `LauncherConfig.profiles` is typed as `LauncherProfile[]`.
- `LauncherColumnDefaults.profileName` is typed as `string | null`.
- `MergedLauncherConfig.profiles` includes the `scope` annotation.

## Step 2: LauncherConfigManager profile support

Files to modify:
- `src/server/launcher-config.ts`

What to implement:

1. Update `DEFAULT_APP_CONFIG` to include the two default profiles:
   - `{ name: "Claude Win", command: "powershell -File run-agent.ps1" }`
   - `{ name: "Claude macOS", command: "bash run-agent.sh" }`

2. Update `emptyConfig()` to include `profiles: []`.

3. Update `parseConfig()` to parse `profiles` from the JSON, defaulting to `[]` if missing (same pattern as templates/skills).

4. Update `getMergedConfig()` to merge profiles using a `Map<string, LauncherProfile & { scope }>`, identical to how templates and skills are merged. Project profiles override app profiles on name collision.

5. Add `addProfile(scope, slug, profile)` method following the exact pattern of `addTemplate`. Check for duplicate names within the same scope, throw if exists, push to array.

6. Add `removeProfile(scope, slug, name)` method following the `removeTemplate` pattern. Filter by name.

7. Add `updateProfile(scope, slug, oldName, profile)` method following the `updateTemplate` pattern. Find by oldName, check rename collision, replace with `{ name: profile.name, command: profile.command }` (strip extra properties).

8. Update `saveColumnDefaults()` to persist the `profileName` field from the `LauncherColumnDefaults` parameter. No changes needed to the method body since it already spreads the full `defaults` object; the caller just needs to pass `profileName` in the defaults.

9. Add `ensurePlatformScripts()` method that writes `run-agent.ps1` and `run-agent.sh` to `this.configDir` (which defaults to `~/.ai-stages/`), but only if they do not already exist. This method should be called from `loadAppConfig()` after the config file is loaded/created.

Dependencies: Step 1 (types).

Acceptance criteria:
- `loadAppConfig()` returns config with two default profiles when no config file exists.
- `getMergedConfig()` returns profiles with correct scope annotations.
- Project-scope profiles override app-scope profiles on name collision.
- `addProfile` throws on duplicate name.
- `removeProfile` silently succeeds for nonexistent name.
- `updateProfile` throws on not-found and on rename collision.
- `updateProfile` strips extra properties (saves only `name` and `command`).
- `saveColumnDefaults` persists `profileName`.
- `ensurePlatformScripts` writes scripts only if not present, does not overwrite existing files.

## Step 3: Platform scripts

Files to create:
- `src/server/platform-scripts.ts`

What to implement:

Define two exported string constants containing the script contents:

1. `RUN_AGENT_PS1` -- a PowerShell script that:
   - Accepts parameters: `$initialPrompt` and `$ticketTitle`.
   - Sets the window title using `$host.UI.RawUI.WindowTitle`.
   - Launches `claude --dangerously-skip-permissions`.
   - Delivers the initial prompt via `WScript.Shell.SendKeys` (the same approach currently used in `agent-launch.ts` but now externalized to a user-editable script).

2. `RUN_AGENT_SH` -- a bash script that:
   - Accepts arguments: `$1` as initialPrompt and `$2` as ticketTitle.
   - Sets the terminal title via ANSI escape `\033]0;title\007`.
   - Launches `claude --dangerously-skip-permissions`.
   - Delivers the initial prompt via AppleScript with System Events (`osascript -e`).

Both scripts should be self-contained, well-commented, and work without the AI Stages app being present (they just need `claude` on PATH).

The `ensurePlatformScripts()` method added in Step 2 imports these constants and writes them to disk.

Dependencies: None (but used by Step 2).

Acceptance criteria:
- `RUN_AGENT_PS1` is a valid PowerShell script that accepts `-initialPrompt` and `-ticketTitle` parameters.
- `RUN_AGENT_SH` is a valid bash script that accepts two positional arguments.
- Both scripts contain comments explaining their purpose.
- Both scripts set the window/terminal title from the ticket title.

## Step 4: LauncherConfigManager tests

Files to modify:
- `src/server/launcher-config.test.ts`

What to implement:

Add test cases following the exact patterns already established for templates and skills in this file:

1. `loadAppConfig returns defaults with two profiles when file is missing` -- verify both "Claude Win" and "Claude macOS" profiles are present.

2. `addProfile to app scope, verify file on disk` -- same pattern as `addTemplate to app scope`.

3. `addProfile with duplicate name throws` -- same pattern as `addTemplate with duplicate name throws`.

4. `removeProfile removes from correct scope` -- same pattern as `removeTemplate removes from correct scope`.

5. `updateProfile renames correctly` -- same pattern as `updateTemplate renames correctly`.

6. `updateProfile strips extra properties` -- same pattern as `updateTemplate strips extra properties`.

7. `merge: app profiles + project profiles, project wins on name collision` -- same pattern as template merge test.

8. `merge: scope annotations are correct for profiles` -- verify app/project scope values.

9. `saveColumnDefaults with profileName persists through roundtrip` -- verify profileName is saved and loaded correctly.

10. `getMergedConfig includes profileName in columnDefaults` -- verify profileName flows through merge.

11. `ensurePlatformScripts writes scripts only if missing` -- create temp dir, call method, verify files exist, modify a file, call again, verify modification is preserved.

12. `ensurePlatformScripts creates scripts on first loadAppConfig` -- verify scripts appear after loadAppConfig on fresh dir.

Dependencies: Steps 1, 2, 3.

Acceptance criteria:
- All new tests pass.
- Tests use the same `tmpDir`/`cleanup`/`afterEach` pattern as existing tests.
- No singleton imports; tests create `new LauncherConfigManager(configDir)` directly.

## Step 5: Agent launch refactor

Files to modify:
- `src/server/agent-launch.ts`

What to implement:

1. Add `profileName: string` to the `LaunchRequest` interface.

2. Update `parseLaunchRequest` to parse `profileName` from the body with a sensible default (empty string `""`), using the same `typeof b.profileName === "string"` guard pattern as `templateName`.

3. Refactor `launchAgent` to use the profile command instead of the hardcoded bat/wt/SendKeys approach:

   a. Look up the profile by `launchRequest.profileName` from the merged config. If not found, fall back to the first profile, then to a hardcoded error.

   b. Parse the profile command string: split on whitespace to get `[executable, ...args]`. Use the first token as the executable and the rest as base arguments.

   c. Append two additional arguments to the args array: the `initialPrompt` string and the `windowTitle` (ticket title + TITLE_SUFFIX). These become positional parameters that the platform script receives.

   d. Spawn the process using `spawn(executable, [...baseArgs, initialPrompt, windowTitle], { cwd: launchDir, detached: true, stdio: "ignore" })` and call `.unref()`.

   e. Remove the bat file creation, the `wt` spawn call, and the `trySendKeys` call from `launchAgent`. These are now the responsibility of the platform scripts.

4. Update the `saveColumnDefaults` call at the end of `launchAgent` to include `profileName: launchRequest.profileName` in the defaults object.

5. Keep `trySendKeys`, `windowExists`, `escapeSendKeys`, `escapeTitle`, `buildWindowTitle`, and `SendKeysHandle` exported as they are. The `windowExists` function is still used by the `run.ts` route to check for duplicate windows. The other SendKeys functions are no longer called by `launchAgent` but may be used by the platform script in the future or by tests. Keeping them avoids breaking imports. If you prefer, move them to a separate utility module, but that is not required.

Dependencies: Steps 1, 2.

Acceptance criteria:
- `LaunchRequest` has a `profileName` field.
- `parseLaunchRequest` extracts `profileName` from body with empty-string default.
- `launchAgent` spawns the profile command with `initialPrompt` and `windowTitle` appended as arguments.
- `launchAgent` sets `cwd` to `launchDir`.
- The bat file creation, `wt` spawn, and `trySendKeys` call are removed from `launchAgent`.
- Column defaults are saved with `profileName`.

## Step 6: Agent launch tests

Files to modify:
- `src/server/agent-launch.test.ts`

What to implement:

1. Update the replicated `parseLaunchRequest` function to include `profileName` parsing, matching the updated source.

2. Update the code-inspection test `replicated function matches source code` to also check for `profileName` patterns in the source.

3. Add test: `parseLaunchRequest with profileName extracts string value` -- verify `{ profileName: "Claude Win" }` parses correctly.

4. Add test: `parseLaunchRequest with missing profileName defaults to empty string` -- verify `{}` yields `profileName: ""`.

5. Add test: `parseLaunchRequest with non-string profileName defaults to empty string`.

6. Update the code-inspection tests in `launchAgent ticketDir vs launchDir separation` to match the new spawn call pattern (no longer `spawn("wt", ...)` but `spawn(executable, ...)` with `cwd: launchDir`).

7. Add code-inspection test: `launchAgent spawns the profile command with cwd set to launchDir` -- verify the source contains `spawn(` with `cwd: launchDir`.

8. Add code-inspection test: `launchAgent no longer creates a bat file` -- verify `batPath` and `.bat` no longer appear in the source.

9. Add code-inspection test: `launchAgent no longer calls trySendKeys directly` -- verify `trySendKeys(` does not appear in the launchAgent function body.

10. Add code-inspection test: `launchAgent saves profileName in column defaults` -- verify the source contains `profileName` in the saveColumnDefaults call.

Dependencies: Step 5.

Acceptance criteria:
- All updated and new tests pass.
- Code-inspection tests verify the structural changes to agent-launch.ts.

## Step 7: API routes for profile CRUD

Files to create:
- `src/routes/api/launcher-config/profiles.ts` (app-scope)
- `src/routes/api/projects/[slug]/launcher-config/profiles.ts` (project-scope)

What to implement:

Both files follow the exact same pattern as the existing `templates.ts` and `skills.ts` route files.

App-scope `profiles.ts`:
- `POST`: extract `{ name, command }` from body, call `launcherConfigManager.addProfile("app", "", { name, command })`, return 201.
- `PUT`: extract `{ oldName, name, command }` from body, call `launcherConfigManager.updateProfile("app", "", oldName, { name, command })`, return 204.
- `DELETE`: extract `{ name }` from body, call `launcherConfigManager.removeProfile("app", "", name)`, return 204.
- All wrapped in try/catch returning 400 with `errorMessage(e)`.

Project-scope `profiles.ts`:
- Same as app-scope but uses `params.slug` and `scope: "project"`.

Dependencies: Step 2 (profile methods on LauncherConfigManager).

Acceptance criteria:
- POST creates a profile in the correct scope and returns 201.
- PUT updates a profile (including rename) and returns 204.
- DELETE removes a profile and returns 204.
- Errors return 400 with the error message.
- The app-scope routes pass `""` as slug (matching template/skill routes).
- The project-scope routes use `params.slug`.

## Step 8: API route tests

Files to modify:
- `src/server/ai-run-route.test.ts`

What to implement:

1. Add a `parseLaunchRequest` section that tests profileName parsing, following the existing `parseLaunchRequest with missing/malformed request body` pattern:
   - Update the replicated `parseLaunchRequest` to include `profileName`.
   - Update `DEFAULTS` to include `profileName: ""`.
   - Add test: `body with profileName parses correctly`.
   - Add test: `body with non-string profileName uses default`.

2. Update the code-inspection test `launchAgent ticketDir vs launchDir separation` to reflect the new spawn pattern (no longer `spawn("wt", ["-d", launchDir, ...])` but spawn with `cwd: launchDir` in options).

3. Add code-inspection test: `launchAgent saves profileName in column defaults` -- read agent-launch.ts source and verify profileName appears in the saveColumnDefaults call.

4. Add code-inspection test: `launchAgent spawns profile command` -- verify the source constructs the spawn call from a profile command, not a hardcoded bat path.

Dependencies: Steps 5, 6.

Acceptance criteria:
- All updated and new tests pass.
- The replicated `parseLaunchRequest` matches the updated production source.
- Code-inspection tests confirm the new spawn pattern.

## Step 9: Settings dialog with tabs and profile management

Files to modify:
- `src/components/LauncherSettings.tsx`

What to implement:

1. Rename the dialog title from "Launcher Settings" to "Settings".

2. Add tab navigation state: `const [activeTab, setActiveTab] = createSignal<"general" | "profiles">("general")`.

3. Add a tab bar below the dialog header and above the content area. Two tabs:
   - "General" (contains the existing Templates, Skills, and worktree root path sections)
   - "Profiles" (new, for managing Coding Agent Profiles)

4. Wrap the existing content (templates list, skills list, worktree root path) in a `<Show when={activeTab() === "general"}>` block.

5. Add the Profiles tab content in a `<Show when={activeTab() === "profiles"}>` block:
   - Profile list with scope badges ("Global" / "Project"), following the same layout as templates/skills.
   - Each profile shows `name` and `command` (truncated) instead of `name` and `text`.
   - Edit and Delete buttons per profile, same styling.
   - "Add" button at the top.

6. Update the `ItemType` type to include `"profile"`: `type ItemType = "template" | "skill" | "profile"`.

7. Update the `ItemFormState` interface: rename `text` to a more generic name or keep `text` and map it to `command` for profiles. Simplest approach: keep the form using `text` internally, and when submitting/editing a profile, map `text` to/from `command` at the API boundary. In the form UI, change the label from "Text" to "Command" when itemType is "profile", and hide the placeholder hint about `{{placeholders}}`.

8. Update `itemEndpoint()` to handle `"profile"` type: return `${base}/profiles`.

9. Update `submitForm()`: when `itemType === "profile"`, send `{ name, command: text }` for POST and `{ oldName, name, command: text }` for PUT (instead of `{ name, text }` and `{ oldName, name, text }`).

10. Update `deleteItem()`: no changes needed since it only sends `{ name }`.

11. Update `startEdit` for profiles: receives `command` as the text parameter.

Dependencies: Steps 1, 7 (API routes must exist for the UI to work).

Acceptance criteria:
- Dialog title is "Settings".
- Two tabs are visible: "General" and "Profiles".
- General tab shows templates, skills, and worktree root path (unchanged behavior).
- Profiles tab lists all merged profiles with scope badges.
- Add/Edit/Delete operations work for profiles.
- Profile form shows "Command" label instead of "Text".
- Profile form does not show placeholder hints.
- Scope radio buttons appear on Add, not on Edit.

## Step 10: Agent Launcher profile dropdown

Files to modify:
- `src/components/AgentLauncher.tsx`

What to implement:

1. Add `const [selectedProfile, setSelectedProfile] = createSignal("")` for tracking the selected profile name.

2. In the `createEffect` that loads the config, initialize `selectedProfile` from column defaults: `defaults.profileName ?? (data.profiles[0]?.name ?? "")`.

3. Add `selectedProfile` to the `launchBody()` function: include `profileName: selectedProfile()` in the JSON body.

4. Add a dropdown (`<select>`) for the profile selection in the Agent Launcher UI. Place it above or alongside the template dropdown. Label it "Profile". Populate options from `cfg().profiles`.

5. The dropdown should always be visible (not conditional on having skills or worktree config).

Dependencies: Steps 1, 5 (LaunchRequest must include profileName), 9 (profiles must be in merged config).

Acceptance criteria:
- Profile dropdown is always visible in the Agent Launcher.
- Profile dropdown is populated from the merged config's profiles list.
- Selected profile is initialized from column defaults on load.
- Selected profile name is sent in the launch request body as `profileName`.
- The dropdown follows the same styling as the template dropdown.

## Step 11: Update settings button tooltip

Files to modify:
- `src/routes/project/[slug].tsx`

What to implement:

1. Change the settings button `title` attribute from `"Launcher Settings"` to `"Settings"`.

Dependencies: None.

Acceptance criteria:
- The tooltip on the settings gear button reads "Settings" instead of "Launcher Settings".

## Step 12: Column defaults API route update

Files to modify:
- `src/routes/api/projects/[slug]/launcher-config/column-defaults.ts`

What to implement:

1. Extract `profileName` from the request body alongside `column`, `templateName`, and `checkedSkills`.
2. Include `profileName` in the object passed to `saveColumnDefaults`.

Dependencies: Step 2 (LauncherColumnDefaults has profileName).

Acceptance criteria:
- The column-defaults PUT endpoint accepts and persists `profileName`.
- Existing functionality for `templateName` and `checkedSkills` is preserved.

## Step 13: End-to-end validation

Run all tests and verify the build:

1. `npx vitest run` -- all tests pass.
2. `npx tsc --noEmit` -- no TypeScript errors.
3. Manually verify: open the app, go to Settings, see General and Profiles tabs, add/edit/delete a profile. Open Agent Launcher, see profile dropdown, launch with a profile selected.

Acceptance criteria:
- All existing tests still pass (no regressions).
- All new tests pass.
- TypeScript compiles without errors.
- The app renders and functions correctly with profiles.

## Edge cases to handle

1. No profiles configured: The Agent Launcher should still render (with an empty dropdown or a message). The launch button should be disabled or show an error if no profile is selected.

2. Profile command is empty string: The server should return an error rather than attempting to spawn an empty command. Add validation in `launchAgent` before spawn.

3. Profile command with spaces in path: The first token of the command is the executable. If users need spaces in the executable path, they should use quotes. The current approach of splitting on whitespace is sufficient for the shipped defaults (`powershell -File run-agent.ps1` and `bash run-agent.sh`).

4. Column defaults reference a deleted profile: The Agent Launcher already handles missing defaults by falling back to the first available item (same pattern as templates). When `profileName` from defaults does not match any profile, fall back to the first profile.

5. Platform scripts already exist on disk: `ensurePlatformScripts` must check with `fs.existsSync` before writing, per the PRD requirement that user edits survive app updates.

6. Mixed OS usage: A user may have both "Claude Win" and "Claude macOS" profiles. The app does not auto-detect the OS; the user selects the appropriate profile. This is explicitly out of scope per the PRD.

## Dependency graph

```
Step 1 (types)
  |
  +---> Step 2 (config manager) --+---> Step 4 (config tests)
  |       |                        |
  |       +---> Step 3 (scripts)   |
  |                                |
  +---> Step 5 (agent launch) -----+---> Step 6 (launch tests)
  |       |                              |
  |       +---> Step 8 (route tests) <---+
  |
  +---> Step 7 (API routes) -------> Step 9 (Settings UI)
  |
  +---> Step 10 (Launcher UI)
  |
  +---> Step 11 (tooltip)
  |
  +---> Step 12 (column defaults route)
  |
  +---> Step 13 (validation) -- depends on all above
```

Steps 3, 11 have no dependencies and can run in parallel with Step 1.
Steps 2, 5, 7 depend only on Step 1.
Steps 4, 6, 8, 9, 10, 12 depend on their respective upstream steps.
Step 13 depends on all steps being complete.
