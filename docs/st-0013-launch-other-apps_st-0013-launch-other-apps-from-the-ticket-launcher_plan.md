# Implementation Plan: ST-0013 Launch Other Apps (Shortcuts)

## Step 1: Types

File: `src/types.ts`

- Add `LauncherShortcut` interface: `{ name: string; command: string }`
- Add `shortcuts?: LauncherShortcut[]` to `LauncherConfig`
- Add `shortcuts: (LauncherShortcut & { scope: "app" | "project" })[]` to `MergedLauncherConfig`

Acceptance: types compile, no test breakage.

## Step 2: LauncherConfigManager

File: `src/server/launcher-config.ts`

- Import `LauncherShortcut` from types
- In `parseConfig`: extract `shortcuts` array (same pattern as skills)
- In `emptyConfig`: add `shortcuts: []`
- In `getMergedConfig`: merge shortcuts with scope tag (same as skills/profiles)
- Add `addShortcut`, `removeShortcut`, `updateShortcut` methods (same pattern as skills)

Acceptance: unit tests pass, merged config includes shortcuts from both scopes.

## Step 3: API Routes for Shortcuts

Files to create:
- `src/routes/api/launcher-config/shortcuts.ts` (app-scope CRUD)
- `src/routes/api/projects/[slug]/launcher-config/shortcuts.ts` (project-scope CRUD)

Follow the exact pattern of `templates.ts` / `skills.ts` at each scope.

Acceptance: POST/PUT/DELETE work at both scopes. GET merged config includes shortcuts.

## Step 4: Shortcut Execution Endpoint

File to create: `src/routes/api/projects/[slug]/board/tickets/[folderName]/shortcut/run.ts`

- Accept POST with `{ name: string }`
- Resolve ticket and project using `resolveTicketAndProject`
- Load merged config, find shortcut by name
- Build variables dict with all ticket placeholders plus `launchDir` (= project.path)
- Interpolate the command string using `interpolatePrompt`
- Split command into executable + args, spawn with `cwd: project.path`
- Use fire-and-forget spawn (unref after 3s, same pattern as agent-launch)
- Return 200 on success, 404 if shortcut not found, 500 on error

Acceptance: spawns process with correct cwd and interpolated placeholders.

## Step 5: UI - Shortcuts in AgentLauncher

File: `src/components/AgentLauncher.tsx`

- Accept shortcuts from the config prop (already in MergedLauncherConfig)
- Render a row of shortcut buttons above the agent launch form border
- Each button: shows shortcut name, on click POSTs to the shortcut/run endpoint
- Disabled state while any shortcut is launching
- On error response, show via the existing ErrorDialog

Acceptance: shortcuts appear as buttons, clicking launches the command, errors display.

## Step 6: UI - Shortcuts Tab in Settings

File: `src/components/LauncherSettings.tsx`

- Add "shortcuts" to ItemType union
- Add "Shortcuts" tab button in the tab bar
- Add shortcuts list section (same pattern as skills)
- The form for shortcuts shows Name + Command fields
- Placeholder hint shows: `{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}} {{launchDir}}`

Acceptance: can add/edit/delete shortcuts at both scopes from the UI.

## Step 7: Tests

- Unit test for LauncherConfigManager shortcut CRUD and merge
- Unit test for shortcut command interpolation
- E2e test for shortcut execution endpoint (mock spawn)

## Dependencies

Steps 1 -> 2 -> 3 -> 4 (sequential, each depends on prior)
Steps 5 and 6 depend on step 1 (types) but can be done after step 3
Step 7 can run last
