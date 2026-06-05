# ST-0017: Adding New Project Refinement

## Problem Statement

When adding a new project, the user cannot choose which Board Definition to use or which branch is the project's main branch. The board defaults to the first entry in boards.json, and the main branch is auto-detected at runtime by checking for "main" then "master". Projects whose main branch has a different name (e.g. "develop", "trunk") cannot be registered without errors when creating Agent Worktrees.

## Solution

Add two new fields to the add-project form, placed between the "Git Repository Path" field and the tickets-related fields:

1. A Board Definition dropdown (`<select>`) that lists all Board Definitions from boards.json and defaults to the first one.
2. A main branch text input that auto-fills by detecting the main branch from the selected git repository, with the ability to override.

## Implementation Decisions

### Data model

- Add `mainBranch` (optional string) and `boardId` (optional string) to `ProjectEntry` in the Project Registry. Both are persisted in config.json alongside path, projectSlug, branch, and ticketsPath.
- `addProject` accepts and stores these two new fields.

### Board Definition list

- The add-project form fetches the Board Definition list once on mount via the existing `GET /api/boards` endpoint.
- The dropdown defaults to the first Board Definition (matching current implicit behavior).

### Main branch detection

- The existing `GET /api/projects?previewPath=...` preview endpoint is extended to return a `mainBranch` field alongside projectSlug, ticketsPath, and defaultWorktreesPath.
- Detection reuses the same logic as `AgentWorktreeManager.getMainBranch`: check for local branch "main", then "master".
- If the path is not a valid git repo, the preview returns an error. No fallback default is shown for the main branch field.
- The main branch field uses the same "touched" pattern as ticketsPath and worktreeRootPath: the auto-detected value fills the field, but manual edits prevent subsequent auto-detections from overwriting the user's choice.

### POST endpoint

- `POST /api/projects` is extended to accept `mainBranch` and `boardId` from the request body and pass them through to `projectRegistry.addProject`.

### AgentWorktreeManager

- `getMainBranch` is updated to accept an optional configured main branch name. When provided, it uses that value directly instead of probing for "main"/"master". The existing auto-detection remains as the fallback when no main branch is configured.

### Form layout

- The two new fields appear after "Git Repository Path" and before "Tickets branch name".
- Order: Git Repository Path, Board Definition, Main branch, Tickets branch name, Tickets folder, Agent worktree root path.

## Out of Scope

- Migrating the existing `boardId` out of Launcher Config. The existing read path via `LauncherConfigManager.getMergedConfig` stays as-is. Only new projects get boardId in ProjectEntry.
- Any changes to Board Definition management (creating, editing, deleting boards).
- Any changes to the project settings dialog or post-creation editing of these fields.

## Further Notes

- The preview endpoint's main branch detection should be extracted from AgentWorktreeManager into a standalone pure function so both the preview endpoint and AgentWorktreeManager can call it without instantiating the full manager.
