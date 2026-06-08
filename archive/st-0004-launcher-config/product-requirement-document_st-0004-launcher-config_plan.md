# Implementation Plan: Launcher Config (ST-0004)

## Overview

Add configurable prompt assembly to the Agent Launcher. Currently the launcher has a single hardcoded prompt and a Run button. After this change, users can define Templates and Skills in JSON config files, select a template and check skills in the launcher UI, and optionally launch agents in isolated git worktrees.

The project is a SolidJS + TypeScript desktop app built with SolidStart/Vinxi. The codebase is at `C:\Users\elkmo\_p\ai-stages`.

## Codebase orientation

Key files and their roles:

- `src/types.ts` -- shared TypeScript interfaces
- `src/server/instances.ts` -- singleton server modules (registry, worktree manager, etc.)
- `src/components/AgentLauncher.tsx` -- current launcher UI (just a Run button)
- `src/components/TicketDetailDialog.tsx` -- hosts the AgentLauncher inside a ResizableWindow
- `src/routes/project/[slug].tsx` -- main page; contains header with ThemeToggle and project dropdown
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts` -- POST handler that spawns a terminal with hardcoded prompt
- `src/server/worktree-manager.ts` -- manages the ai-stages data worktree (NOT the agent worktree from this PRD)
- `src/server/git.ts` -- `git()` and `gitSync()` helpers
- `src/server/project-registry.ts` -- reads/writes `~/.ai-stages/config.json`
- `src/server/board-config.ts` -- reads board column definitions
- `src/server/actions.ts` -- server functions for board data loading
- `src/server/ticket-store.ts` -- ticket CRUD operations
- `src/server/errors.ts` -- `errorMessage()` helper

Conventions:
- Tests live alongside source files as `*.test.ts`
- Server modules are classes with filesystem I/O, constructed with an optional configDir for testing
- No Java threads/ExecutorService/Thread.sleep -- use async/await
- Never swallow errors with empty catch blocks

## Step 1: Define types for launcher config

File to create: none
File to modify: `src/types.ts`

Add these interfaces:

```typescript
export interface LauncherTemplate {
  name: string;
  text: string;
}

export interface LauncherSkill {
  name: string;
  text: string;
}

export interface LauncherColumnDefaults {
  templateName: string | null;
  checkedSkills: string[];
}

export interface LauncherConfig {
  templates: LauncherTemplate[];
  skills: LauncherSkill[];
  columnDefaults?: Record<string, LauncherColumnDefaults>;
  worktreeRootPath?: string;
}

export interface MergedLauncherConfig {
  templates: (LauncherTemplate & { scope: "app" | "project" })[];
  skills: (LauncherSkill & { scope: "app" | "project" })[];
  columnDefaults: Record<string, LauncherColumnDefaults>;
  worktreeRootPath: string | null;
}
```

Acceptance criteria:
- Types compile without errors
- `LauncherConfig` matches the JSON shape from the PRD
- `MergedLauncherConfig` includes scope annotations for the settings UI

## Step 2: Create LauncherConfigManager server module

File to create: `src/server/launcher-config.ts`
File to create: `src/server/launcher-config.test.ts`

This module reads and writes `launcher-config.json` at two scopes:

- App-level: `~/.ai-stages/launcher-config.json`
- Project-level: `~/.ai-stages/worktrees/{slug}/launcher-config.json`

Class: `LauncherConfigManager`

Constructor: `constructor(configDir?: string)` (defaults to `~/.ai-stages`, same pattern as ProjectRegistry)

Methods:

- `loadAppConfig(): LauncherConfig` -- reads app-level file, returns empty defaults if missing/malformed
- `loadProjectConfig(slug: string): LauncherConfig` -- reads project-level file
- `saveAppConfig(config: LauncherConfig): void` -- writes app-level file
- `saveProjectConfig(slug: string, config: LauncherConfig): void` -- writes project-level file
- `getMergedConfig(slug: string): MergedLauncherConfig` -- merges app + project configs
  - Templates: all from app, then all from project. On name collision, project wins (replaces app entry, keeps project scope)
  - Skills: same merge logic
  - columnDefaults: from project config only
  - worktreeRootPath: from project config only
- `saveColumnDefaults(slug: string, column: string, defaults: LauncherColumnDefaults): void` -- updates just the columnDefaults in the project config
- `addTemplate(scope: "app" | "project", slug: string, template: LauncherTemplate): void`
- `addSkill(scope: "app" | "project", slug: string, skill: LauncherSkill): void`
- `removeTemplate(scope: "app" | "project", slug: string, name: string): void`
- `removeSkill(scope: "app" | "project", slug: string, name: string): void`
- `updateTemplate(scope: "app" | "project", slug: string, oldName: string, template: LauncherTemplate): void`
- `updateSkill(scope: "app" | "project", slug: string, oldName: string, skill: LauncherSkill): void`

Default app config (created on first load if missing):

```json
{
  "templates": [
    {
      "name": "Default",
      "text": "Current ticket files are in {{ticketDir}}. Read the files there for context."
    }
  ],
  "skills": []
}
```

Edge cases to handle:
- File does not exist: return empty defaults
- File contains invalid JSON: return empty defaults (log warning, do not throw)
- Missing `templates` or `skills` array: default to `[]`
- Name collision on add: throw an error
- Slug validation: reuse the same safety check pattern as WorktreeManager

Tests (in `launcher-config.test.ts`):
- Load returns defaults when file is missing
- Load returns defaults when file contains invalid JSON
- Save then load roundtrips correctly for app config
- Save then load roundtrips correctly for project config
- Merge: app templates + project templates, project wins on name collision
- Merge: app skills + project skills, project wins on name collision
- Merge: scope annotations are correct
- columnDefaults save and load
- addTemplate to app scope, verify file on disk
- addTemplate with duplicate name throws
- removeTemplate removes from correct scope
- updateTemplate renames correctly
- Same set of tests for skills

Acceptance criteria:
- All tests pass via `npm test`
- Config files are created in the correct directories
- Merge behavior matches PRD: additive, project wins on name collision

Dependencies: Step 1 (types)

## Step 3: Create placeholder interpolation utility

File to create: `src/server/prompt-interpolation.ts`
File to create: `src/server/prompt-interpolation.test.ts`

Function: `interpolatePrompt(text: string, variables: Record<string, string>): string`

Replaces all `{{key}}` placeholders with values from the variables map. Unknown placeholders are left as-is (not stripped).

The caller constructs the variables map:

```typescript
{
  ticketDir: string,      // full path to ticket folder in the ai-stages worktree
  ticketTitle: string,     // from status.json
  ticketNumber: string,    // from status.json
  ticketStatus: string,    // current column
  projectPath: string,     // project repo path
  projectSlug: string      // the slug
}
```

Function: `assemblePrompt(templateText: string, checkedSkillTexts: string[]): string`

Concatenates the template text with all checked skill texts (each separated by `\n\n`), then returns the combined string. The caller interpolates after assembly.

Tests:
- Replaces known placeholders
- Leaves unknown placeholders intact
- Handles multiple occurrences of the same placeholder
- Empty template returns empty string
- Skills append with double newline separator
- No skills appended: returns template text as-is
- Template with no placeholders passes through unchanged

Acceptance criteria:
- All tests pass
- Regex handles `{{` and `}}` correctly without partial matches

Dependencies: none

## Step 4: Register LauncherConfigManager as a singleton

File to modify: `src/server/instances.ts`

Add:

```typescript
import { LauncherConfigManager } from './launcher-config.js';
export const launcherConfigManager = new LauncherConfigManager();
```

Acceptance criteria:
- App starts without errors
- The singleton is accessible from server routes

Dependencies: Step 2

## Step 5: Create API routes for launcher config

File to create: `src/routes/api/launcher-config.ts`
File to create: `src/routes/api/projects/[slug]/launcher-config.ts`
File to create: `src/routes/api/projects/[slug]/launcher-config/column-defaults.ts`

Route 1: `GET /api/launcher-config` -- returns app-level config
Route 2: `PUT /api/launcher-config` -- saves app-level config
Route 3: `GET /api/projects/[slug]/launcher-config` -- returns merged config for the project
Route 4: `GET /api/projects/[slug]/launcher-config/raw` -- returns the raw project-level config (for settings editing)
Route 5: `PUT /api/projects/[slug]/launcher-config` -- saves project-level config
Route 6: `PUT /api/projects/[slug]/launcher-config/column-defaults` -- saves column defaults. Body: `{ column: string, templateName: string | null, checkedSkills: string[] }`

All routes follow the existing pattern: try/catch with `errorMessage()`, return `Response` objects.

Additionally, create CRUD routes for individual templates and skills to support the settings UI:

File to create: `src/routes/api/launcher-config/templates.ts`
- `POST /api/launcher-config/templates` -- add template to app scope. Body: `{ name, text }`
- `DELETE /api/launcher-config/templates` -- remove template from app scope. Body: `{ name }`

File to create: `src/routes/api/projects/[slug]/launcher-config/templates.ts`
- `POST` -- add template to project scope
- `DELETE` -- remove template from project scope

Same pattern for skills:

File to create: `src/routes/api/launcher-config/skills.ts`
File to create: `src/routes/api/projects/[slug]/launcher-config/skills.ts`

Acceptance criteria:
- GET returns valid JSON matching MergedLauncherConfig shape
- PUT persists changes that survive a GET roundtrip
- Column defaults are stored in the project-level config
- Error responses include the error message

Dependencies: Step 4

## Step 6: Update the AI run route to use configurable prompts

File to modify: `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts`

Changes:
- Accept a JSON body with `{ templateName: string, checkedSkills: string[], useWorktree?: boolean }`
- Load the merged launcher config for the slug
- Find the selected template by name; fall back to the "Default" template if not found
- Filter skills by the checked names
- Call `assemblePrompt()` then `interpolatePrompt()` to build the final prompt
- Replace the hardcoded `initialPrompt` with the interpolated result
- When `useWorktree` is true, use the agent worktree logic (Step 8) instead of the project path for spawning
- Save column defaults (selected template + checked skills) for the ticket's current column

Construct the variables map:

```typescript
const variables = {
  ticketDir: path.resolve(worktreeDir, folderName),
  ticketTitle: ticket.title,
  ticketNumber: ticket.number,
  ticketStatus: ticket.status,
  projectPath: project.path,
  projectSlug: slug,
};
```

Note: `ticketDir` always points to the ai-stages data worktree (where ticket markdown files live), regardless of the `useWorktree` flag. The `useWorktree` flag controls where the terminal opens (project dir vs agent worktree).

Acceptance criteria:
- Sending a POST with `templateName` and `checkedSkills` produces the correct interpolated prompt
- Backward compatibility: if no body is sent (or body is empty), use "Default" template with no skills
- The `escapeSendKeys` call still works on the interpolated prompt

Edge cases:
- Template not found: fall back to "Default" template. If "Default" also missing, use the old hardcoded prompt.
- Skill name in `checkedSkills` not found in config: skip silently

Dependencies: Steps 3, 4, 5

## Step 7: Update AgentLauncher UI component

File to modify: `src/components/AgentLauncher.tsx`

The current component is 59 lines with just a Run button and error modal. Replace it with the full launcher layout.

Props change -- add `columns` to know which column the ticket is in (used for per-column defaults):

```typescript
interface AgentLauncherProps {
  slug: string;
  ticket: TicketInfo;
}
```

The ticket already has a `status` field that contains the current column name, so no prop change is needed.

New signals:
- `config: MergedLauncherConfig | null` -- loaded on mount
- `selectedTemplate: string` -- name of selected template
- `checkedSkills: Set<string>` -- names of checked skills
- `useWorktree: boolean` -- worktree toggle state
- `loading: boolean` -- config loading state

On mount (createEffect triggered by props.ticket changes):
1. Fetch `GET /api/projects/{slug}/launcher-config`
2. Set `config` signal
3. Apply column defaults: if `config.columnDefaults[ticket.status]` exists, set `selectedTemplate` to its `templateName` and `checkedSkills` to its `checkedSkills`
4. If no column defaults, select the first template and check no skills

Layout (vertical stack):

1. Template dropdown (same styling as the file dropdown in TicketDetailDialog):
   - Shows template names from `config.templates`
   - Selected value is `selectedTemplate`

2. Skill checkboxes:
   - One checkbox per skill in `config.skills`
   - Checked state from `checkedSkills` set
   - Each checkbox label shows the skill name

3. Worktree toggle (only visible when `config.worktreeRootPath` is not null):
   - A labeled toggle/checkbox: "Launch in worktree"
   - When checked, sets `useWorktree` to true

4. Run button (same as current, but sends config in the request body):
   - POST body: `{ templateName: selectedTemplate, checkedSkills: [...checkedSkills], useWorktree }`
   - On success: save column defaults via `PUT /api/projects/{slug}/launcher-config/column-defaults`

5. Error modal (keep the existing pattern)

Acceptance criteria:
- Template dropdown shows all templates from merged config
- Selecting a template updates the signal
- Checking/unchecking skills updates the set
- Run button sends the correct payload
- Column defaults are loaded and applied when switching to the launcher
- Column defaults are saved after a successful launch
- Worktree toggle only appears when worktreeRootPath is configured
- Loading state shows while fetching config

Dependencies: Steps 5, 6

## Step 8: Agent worktree creation

File to create: `src/server/agent-worktree.ts`
File to create: `src/server/agent-worktree.test.ts`

Class: `AgentWorktreeManager`

Constructor: `constructor()` (no configDir needed, reads worktreeRootPath from LauncherConfigManager)

Method: `ensureAgentWorktree(projectPath: string, slug: string, folderName: string): Promise<{ worktreePath: string }>`

Logic:
1. Load the project launcher config to get `worktreeRootPath`
2. If `worktreeRootPath` is not set, throw an error
3. Branch name: `ai/{folderName}` (e.g. `ai/st-0004-launcher-config`)
4. Worktree path: `{worktreeRootPath}/{folderName}`
5. Determine main branch: check if `main` exists, fall back to `master`
6. Pre-launch checks:
   a. Check for uncommitted/untracked changes on main/master: `git status --porcelain`. If non-empty, throw error with message "Main branch has uncommitted changes. Commit or stash before launching."
   b. Check if main/master is behind remote: `git rev-list HEAD..@{upstream} --count`. If count > 0, return a `{ behindRemote: true }` signal (the UI handles the modal)
7. If branch and worktree already exist, reuse them (check with `git worktree list`)
8. If they do not exist, create: `git worktree add -b ai/{folderName} {worktreePath} main`

Method: `pullMainBranch(projectPath: string): Promise<void>`
- Run `git pull` on the main/master branch
- If it fails (conflicts), throw an error with a clear message

Method: `getMainBranch(projectPath: string): Promise<string>`
- Check if `main` branch exists, fall back to `master`
- If neither exists, throw

Tests:
- Creates worktree at the correct path with correct branch name
- Reuses existing worktree
- Detects uncommitted changes and throws
- Detects behind-remote state
- Falls back from `main` to `master`
- Throws when neither `main` nor `master` exists
- Handles worktreeRootPath with spaces in path

Acceptance criteria:
- All tests pass
- Agent worktree is created in the configured root path
- Branch naming follows `ai/{folderName}` convention
- Pre-launch checks surface clear error messages

Dependencies: Steps 2, 4

## Step 9: Integrate agent worktree into the run route

File to modify: `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts`

When `useWorktree` is true in the request body:

1. Call `agentWorktreeManager.ensureAgentWorktree(project.path, slug, folderName)`
2. If the result indicates `behindRemote`, return a 409 response with body `{ behindRemote: true, message: "Main branch is behind remote. Pull latest changes before launching?" }`
3. If successful, use the worktree path as the `-d` argument to `wt` instead of `project.path`

Add a new route for pulling:

File to create: `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/pull-and-retry.ts`

- POST handler that calls `agentWorktreeManager.pullMainBranch(project.path)` and then retries the worktree creation
- Returns the same response as the run route on success

Acceptance criteria:
- When useWorktree is true, the terminal opens in the agent worktree directory
- When useWorktree is false (or not sent), behavior is unchanged from before
- Behind-remote check triggers the correct 409 response
- Pull-and-retry route handles the pull-then-launch flow

Dependencies: Step 8

## Step 10: Add behind-remote modal to AgentLauncher UI

File to modify: `src/components/AgentLauncher.tsx`

When the run response is 409 with `behindRemote: true`:
1. Show a confirmation modal: "Main branch is behind remote. Pull latest changes before launching?"
2. Confirm button: calls `POST /api/projects/{slug}/board/tickets/{folderName}/ai/pull-and-retry` with the same body
3. Cancel button: dismisses the modal without launching

When the run response indicates uncommitted changes (400 with the specific error message):
1. Show the standard error modal with the message

Acceptance criteria:
- Behind-remote modal appears with correct message
- Confirm triggers pull-and-retry
- Cancel dismisses without action
- Uncommitted changes error shows in the standard error modal
- Pull failure (conflicts) shows error in the modal

Dependencies: Step 9

## Step 11: Register AgentWorktreeManager as a singleton

File to modify: `src/server/instances.ts`

Add:

```typescript
import { AgentWorktreeManager } from './agent-worktree.js';
export const agentWorktreeManager = new AgentWorktreeManager();
```

Note: the AgentWorktreeManager needs access to launcherConfigManager. Either pass it in the constructor or import the singleton directly. The constructor injection pattern is cleaner for testing:

```typescript
export const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager);
```

Acceptance criteria:
- Singleton is created and accessible from route handlers

Dependencies: Steps 8, 4

## Step 12: Create settings management UI

File to create: `src/components/LauncherSettings.tsx`

A full-screen modal (using ResizableWindow) for managing templates and skills.

Layout:
- Title: "Launcher Settings"
- A single list showing all templates and skills, each with:
  - Name
  - Type indicator (Template / Skill)
  - Scope indicator (App / Project)
  - Edit button
  - Delete button
- Add button at the bottom with a dropdown: "Add Template" / "Add Skill"
- When adding, show a form with:
  - Name input
  - Template text textarea
  - Scope selector (App / Project radio buttons)
- When editing, show the same form pre-filled

API calls:
- Load: `GET /api/projects/{slug}/launcher-config` (merged view)
- Add template: `POST /api/launcher-config/templates` or `POST /api/projects/{slug}/launcher-config/templates`
- Delete template: `DELETE /api/launcher-config/templates` or `DELETE /api/projects/{slug}/launcher-config/templates`
- Same for skills

Acceptance criteria:
- Settings modal shows all templates and skills from both scopes
- Scope indicator (App/Project) is visible on each item
- Adding a template to app scope writes to the app-level config file
- Adding a template to project scope writes to the project-level config file
- Editing updates the correct scope's file
- Deleting removes from the correct scope's file
- Name collision is rejected with an error message
- After changes, re-fetching the merged config shows updated data

Dependencies: Steps 5, 7

## Step 13: Add settings button to the app header

File to modify: `src/routes/project/[slug].tsx`

Add a gear icon button next to the ThemeToggle in the header. On click, open the LauncherSettings modal.

The button needs the current slug to pass to LauncherSettings (for project-scope operations).

```tsx
import LauncherSettings from "~/components/LauncherSettings";
// ...
const [settingsOpen, setSettingsOpen] = createSignal(false);
// In the header, next to ThemeToggle:
<button onClick={() => setSettingsOpen(true)} class="..." title="Launcher Settings">
  {/* gear SVG icon */}
</button>
// After the other dialogs:
<LauncherSettings open={settingsOpen()} onOpenChange={setSettingsOpen} slug={d().slug} />
```

Acceptance criteria:
- Gear icon button appears next to the dark mode toggle
- Clicking it opens the settings modal
- Settings modal receives the current project slug

Dependencies: Step 12

## Step 14: Update TicketDetailDialog to pass needed data

File to modify: `src/components/TicketDetailDialog.tsx`

The AgentLauncher component already receives `slug` and `ticket` which contain all needed information (ticket.status gives the current column). No changes needed to the props unless the AgentLauncher needs additional data.

Review the AgentLauncher mount flow: when `showAiConsole` toggles to true, the AgentLauncher fetches its config. When it toggles back, state is discarded. This is fine since the config is re-fetched each time.

Acceptance criteria:
- AgentLauncher renders correctly within TicketDetailDialog
- Config loading does not block the file editor

Dependencies: Step 7

## Implementation order with dependency graph

```
Step 1 (types)
   |
   v
Step 2 (LauncherConfigManager) ------> Step 3 (interpolation)
   |                                        |
   v                                        v
Step 4 (singleton) -------> Step 6 (update run route) <--- Step 3
   |                              |
   v                              v
Step 5 (API routes) -------> Step 7 (AgentLauncher UI)
   |                              |
   v                              v
Step 8 (agent worktree) --> Step 11 (singleton)
   |                              |
   v                              v
Step 9 (integrate worktree) -> Step 10 (behind-remote modal)
                                      |
                                      v
Step 12 (settings UI) ---------> Step 13 (header button)
                                      |
                                      v
                               Step 14 (review integration)
```

Suggested sequential order for implementation:

1. Step 1 -- types
2. Step 3 -- interpolation utility (no dependencies)
3. Step 2 -- LauncherConfigManager
4. Step 4 -- register singleton
5. Step 5 -- API routes
6. Step 6 -- update run route
7. Step 7 -- AgentLauncher UI
8. Step 14 -- verify TicketDetailDialog integration
9. Step 8 -- agent worktree creation
10. Step 11 -- register AgentWorktreeManager singleton
11. Step 9 -- integrate agent worktree into run route
12. Step 10 -- behind-remote modal
13. Step 12 -- settings UI
14. Step 13 -- header button

## Validation checklist

After all steps:

- [ ] `npm test` passes (all existing + new tests)
- [ ] App starts with `npm run dev` without errors
- [ ] Opening a ticket and switching to Agent Launcher shows the template dropdown and skill checkboxes
- [ ] Selecting a template and checking skills, then clicking Run, opens a terminal with the interpolated prompt
- [ ] Column defaults are persisted: switching away and back to the launcher restores selections
- [ ] Settings button in header opens the management screen
- [ ] Templates and skills can be added/edited/deleted at both app and project scopes
- [ ] Project-scope items override app-scope items with the same name
- [ ] When worktreeRootPath is configured in the project launcher config, the worktree toggle appears
- [ ] Enabling the worktree toggle creates a git worktree at the configured path
- [ ] Uncommitted changes on main/master block launch with a clear error
- [ ] Behind-remote state shows a pull confirmation modal
- [ ] With no launcher-config.json files present, the app uses the default template and works as before

## Files summary

New files:
- `src/server/launcher-config.ts`
- `src/server/launcher-config.test.ts`
- `src/server/prompt-interpolation.ts`
- `src/server/prompt-interpolation.test.ts`
- `src/server/agent-worktree.ts`
- `src/server/agent-worktree.test.ts`
- `src/routes/api/launcher-config.ts`
- `src/routes/api/launcher-config/templates.ts`
- `src/routes/api/launcher-config/skills.ts`
- `src/routes/api/projects/[slug]/launcher-config.ts`
- `src/routes/api/projects/[slug]/launcher-config/column-defaults.ts`
- `src/routes/api/projects/[slug]/launcher-config/templates.ts`
- `src/routes/api/projects/[slug]/launcher-config/skills.ts`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/pull-and-retry.ts`
- `src/components/LauncherSettings.tsx`

Modified files:
- `src/types.ts`
- `src/server/instances.ts`
- `src/components/AgentLauncher.tsx`
- `src/routes/project/[slug].tsx`
- `src/routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts`
- `src/components/TicketDetailDialog.tsx` (review only, may not need changes)
