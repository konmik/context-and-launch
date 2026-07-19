## Problem Statement

The `boardId` field -- which determines which Board Definition a project uses -- is stored in two places: the Project Registry (ProjectEntry in config.json) and the project-level Launcher Config (launcher-config.json). These two copies are written by different code paths and read inconsistently:

- Adding a project writes boardId to the Project Registry.
- Changing the board in Settings writes boardId to the Launcher Config.
- Loading the board reads boardId from the Launcher Config only, making the Project Registry value dead after creation.

This dual storage is confusing and error-prone. The Launcher Config is the wrong home for boardId -- it's a project identity concern, not a launcher concern.

## Solution

Make the Project Registry the single source of truth for boardId. Remove boardId from the Launcher Config entirely. Rename `loadBoard` to `loadProjectPage` to better reflect what the method actually does.

## Implementation Decisions

- boardId stays on ProjectEntry in the Project Registry. No type change needed -- it's already `boardId?: string`.
- Remove boardId from `LauncherConfig`, `MergedLauncherConfig`, `parseConfig()`, and `getMergedConfig()`.
- Delete the `PUT /api/projects/{projectSlug}/launcher-config/board-id` endpoint.
- Create a new `PUT /api/projects/{projectSlug}/board-id` endpoint that updates boardId on the Project Registry entry directly.
- Update `handleBoardIdChange` in the settings UI to call the new endpoint.
- In `BoardService.loadProjectPage()` (renamed from `loadBoard`), read boardId directly from the project entry (`project.boardId`) instead of going through the merged Launcher Config.
- Remove the `LauncherConfigManager` dependency from `BoardService` entirely -- boardId was the only reason it was injected.
- Rename `loadBoard` to `loadProjectPage` across the codebase (BoardService method, server action, route loader). Rename `BoardPageData` to `ProjectPageData`. Rename `BoardService` to `ProjectPageService`.
- No migration of existing launcher-config.json files. Stale boardId keys in those files are harmlessly ignored by `parseConfig()` since it will no longer read them.

## Out of Scope

- Migration tooling for existing launcher-config.json files.
- Changing how boardId is set during project creation (the AddProjectForm flow already writes to the Project Registry correctly).
- Renaming or restructuring any other Launcher Config fields.

## Further Notes

The `BoardState`, `BoardPageBase` types keep their names -- "board" is correct vocabulary for the data they describe. The rename targets only the service/action/page-data layer that does more than board loading.
