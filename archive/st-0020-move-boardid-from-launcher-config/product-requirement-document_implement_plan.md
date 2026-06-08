## Implementation Plan: ST-0020 -- Move boardId from LauncherConfig to Project Registry

### Summary of Changes

Move `boardId` from `LauncherConfig`/`MergedLauncherConfig` to be read exclusively from the Project Registry (`config.json`). Rename `loadBoard` to `loadProjectPage`, `BoardPageData` to `ProjectPageData`, `BoardService` to `ProjectPageService`. Delete the old launcher-config board-id endpoint, create a new project-level board-id endpoint, and remove `LauncherConfigManager` as a dependency of the page service.

### Dependency Graph

```
Step 1 (ProjectRegistry.setBoardId)
  |
  v
Step 2 (new PUT endpoint) ---> Step 3 (delete old endpoint)
                                    |
Step 4 (remove boardId from LauncherConfig types) <--+
  |
  v
Step 5 (update settings UI + launcher-config GET)
  |
  v
Step 6 (rename BoardService/loadBoard/BoardPageData, remove LauncherConfigManager dep)
  |
  v
Step 7 (update e2e tests and e2e fixtures)
  |
  v
Step 8 (run full test suite)
```

---

### Step 1: Add `setBoardId` method to ProjectRegistry

File to modify: `src/server/project/project-registry.ts`

Add a new method to the `ProjectRegistry` class after the existing `setLastUsed` method (around line 285):

```typescript
setBoardId(projectSlug: string, boardId: string): void {
    const config = this.load();
    const index = config.projects.findIndex((p) => p.projectSlug === projectSlug);
    if (index < 0) throw new Error(`Project not found: ${projectSlug}`);
    const updated = { ...config.projects[index], boardId };
    const newProjects = config.projects.map((p, i) => (i === index ? updated : p));
    this.save({ ...config, projects: newProjects });
}
```

File to modify: `src/server/project/project-registry.test.ts`

Add two unit tests:

Test 1 -- "setBoardId persists boardId to config.json": Create a registry with a project, call `setBoardId('my-proj', 'simple')`, then read config.json from disk and assert `projects[0].boardId === 'simple'`. Also verify other fields (path, branch, etc.) are not clobbered.

Test 2 -- "setBoardId throws for unknown project": Call `setBoardId('nonexistent', 'kanban')` and expect it to throw "Project not found".

Acceptance criteria:
- `setBoardId` writes boardId to the correct project entry in config.json
- Other fields on the entry are preserved
- Throws descriptively for unknown project slugs

Validation: Run `npx vitest run src/server/project/project-registry.test.ts`

---

### Step 2: Create new PUT endpoint for board-id

File to create: `src/routes/api/projects/[projectSlug]/board-id.ts`

```typescript
import { projectRegistry } from "~/server/config/instances.js";
import { ValidationError } from "~/server/shared/errors.js";
import { withService } from "~/server/shared/route-helpers.js";

export const PUT = withService(async ({ params, request }) => {
    const { projectSlug } = params;
    const { boardId } = await request.json();
    if (!boardId || typeof boardId !== "string") {
        throw new ValidationError("Missing required field: boardId");
    }
    projectRegistry.setBoardId(projectSlug, boardId);
    return new Response(null, { status: 204 });
});
```

Acceptance criteria:
- PUT to `/api/projects/{projectSlug}/board-id` with `{ "boardId": "simple" }` returns 204 and writes to config.json
- Missing/non-string boardId returns 400

Validation: Unit test for the registry method covers the write; e2e (Step 7) covers the full HTTP path.

Dependency: Step 1

---

### Step 3: Delete old board-id endpoint

File to delete: `src/routes/api/projects/[projectSlug]/launcher-config/board-id.ts`

Remove this file entirely.

Acceptance criteria: File no longer exists. No compile errors.

Validation: `npx tsc --noEmit`

Dependency: Step 2 (new endpoint exists before deleting old one)

---

### Step 4: Remove boardId from LauncherConfig types and parsing

File to modify: `src/server/launcher/launcher-config.ts`

1. `LauncherConfig` interface: remove `boardId?: string;`
2. `MergedLauncherConfig` interface: remove `boardId: string | null;`
3. `parseConfig` function: remove `boardId: parsed.boardId,`
4. `getMergedConfig` method: remove `boardId: project.boardId ?? null,`

Acceptance criteria:
- `LauncherConfig` and `MergedLauncherConfig` no longer contain a `boardId` field
- `parseConfig` ignores any `boardId` in the raw JSON (harmless stale data)
- TypeScript compiler will report errors in downstream files that reference `boardId` on these types (fixed in subsequent steps)

Validation: Expect compile errors at this point -- they will be resolved in Steps 5 and 6.

Dependency: None (but Steps 5-6 depend on this)

---

### Step 5: Update settings UI to use new endpoint and data source

#### Step 5a: Return projectBoardId from launcher-config GET endpoint

File to modify: `src/routes/api/projects/[projectSlug]/launcher-config.ts`

In the GET handler, after getting the merged config, look up the project's boardId from the registry and include it in the response.

#### Step 5b: Update launcher-settings-state to use projectBoardId

File to modify: `src/components/launcher/launcher-settings-state.ts`

1. Add a new signal for the project's board ID
2. In `loadConfig()`, after `setConfig(data)`, set `projectBoardId` from the response
3. In `selectedBoardId` memo, replace `valid(config()?.boardId)` with `valid(projectBoardId())`
4. In `handleBoardIdChange`, change the URL from `/api/projects/${props.projectSlug}/launcher-config/board-id` to `/api/projects/${props.projectSlug}/board-id`

Acceptance criteria:
- Settings UI fetches and displays the correct board on open
- Changing the board calls the new endpoint
- The board selector reflects changes immediately

Validation: `npx tsc --noEmit` passes.

Dependency: Steps 3, 4

---

### Step 6: Rename BoardService, loadBoard, BoardPageData; remove LauncherConfigManager dependency

#### Step 6a: Rename board-service.ts to project-page-service.ts

File to rename: `src/server/board/board-service.ts` to `src/server/board/project-page-service.ts`

Changes inside the file:
- Rename class `BoardService` to `ProjectPageService`
- Rename method `loadBoard` to `loadProjectPage`
- Remove the `LauncherConfigManager` import and constructor parameter
- Read boardId from `project.boardId` instead of going through merged config

#### Step 6b: Rename BoardPageData to ProjectPageData in board-types.ts

File to modify: `src/server/board/board-types.ts`

- Rename `BoardPageData` to `ProjectPageData`

#### Step 6c: Rename test file

File to rename: `src/server/board/board-service.test.ts` to `src/server/board/project-page-service.test.ts`

Changes:
- Update imports: `ProjectPageService` from `./project-page-service.js`
- Remove `LauncherConfigManager` from the `stubDeps` function
- Update the constructor call to not pass `launcherConfigManager`
- Rename describe block from `'BoardService.loadBoard'` to `'ProjectPageService.loadProjectPage'`
- Change `service.loadBoard(...)` calls to `service.loadProjectPage(...)`

#### Step 6d: Update service-container.ts

File to modify: `src/server/config/service-container.ts`

- Change import to `ProjectPageService` from `../board/project-page-service.js`
- Rename `boardService` to `projectPageService` in interface and construction

#### Step 6e: Update instances.ts

File to modify: `src/server/config/instances.ts`

- Replace `boardService` export with `projectPageService`

#### Step 6f: Update actions.ts

File to modify: `src/server/actions.ts`

- Import `projectPageService` instead of `boardService`
- Re-export `ProjectPageData` instead of `BoardPageData`
- Rename function to `loadProjectPage`
- Keep query cache key `"board-data"` unchanged

#### Step 6g: Update [projectSlug].tsx route

File to modify: `src/routes/project/[projectSlug].tsx`

- Import and use `loadProjectPage` instead of `loadBoard`

Acceptance criteria:
- No references to `BoardService`, `loadBoard`, or `BoardPageData` remain in the codebase
- `BoardState`, `BoardPageBase` keep their names
- `ProjectPageService` has no `LauncherConfigManager` dependency
- TypeScript compiles cleanly

Validation: `npx tsc --noEmit` passes. `npx vitest run src/server/board/project-page-service.test.ts` passes.

Dependency: Step 4

---

### Step 7: Update e2e tests and fixtures

#### Step 7a: Update e2e fixtures

File to modify: `e2e/fixtures.ts`

In the `LauncherConfigShape` interface: remove `boardId?: string;`

#### Step 7b: Update launcher-settings-columns-tab e2e test

File to modify: `e2e/launcher-settings-columns-tab.test.ts`

In the test for board change:
- Replace assertions checking `readProjectLauncherConfig(...).boardId` with assertions checking the project registry entry's `boardId`

Acceptance criteria:
- e2e test validates that boardId is written to config.json (project registry), not launcher-config.json
- All other e2e tests remain green

Validation: `npm run test:all`

Dependency: Steps 1-6

---

### Step 8: Final Verification

Run the full test suite: `npm run test:all`

This runs `tsc` (type check), unit tests (vitest), build, and e2e tests (playwright).

Acceptance criteria:
- Zero type errors
- Zero test failures
- No references to old names (`BoardService`, `loadBoard`, `BoardPageData`) remain except in git history

Verification grep commands:
```
grep -r "BoardService" src/
grep -r "loadBoard" src/
grep -r "BoardPageData" src/
grep -r "launcher-config/board-id" src/
```

---

### Edge Cases

1. Stale boardId in launcher-config.json files: `parseConfig` will no longer read `boardId`. Any existing `boardId` key in launcher-config.json is harmlessly ignored. No migration needed.

2. Project with no boardId: `project.boardId` is `string | undefined`. `boardConfigManager.getConfig(undefined)` falls back to `boards[0].id` (the default board). This matches the current behavior.

3. Concurrent config.json writes: `ProjectRegistry.setBoardId` uses the same `load()`/`save()` pattern as `setLastUsed`. No new concurrency risk is introduced.

4. Query cache key: The query key `"board-data"` is used by `revalidate("board-data")` in multiple files. The key must remain unchanged to avoid breaking cache invalidation.

5. `AgentWorktreeManager` dependency on LauncherConfigManager: This class uses `LauncherConfigManager` for `worktreeRootPath` only, never `boardId`. No changes needed.
