# ST-0017 Implementation Plan: Adding New Project Refinement

## Overview

Add a Board Definition dropdown and a main branch text input to the add-project form. The main branch auto-fills from the git repository preview endpoint, using the same "touched" pattern already in use for ticketsPath and worktreeRootPath. Both values are stored in ProjectEntry and forwarded to the POST /api/projects endpoint.

---

## Step 1: Extract `detectMainBranch` pure function

### What

Extract the "main" / "master" probing logic out of `AgentWorktreeManager.getMainBranch` into a standalone exported async function in `src/server/infra/git.ts`. `AgentWorktreeManager.getMainBranch` then becomes a thin wrapper around it.

### Files

- `src/server/infra/git.ts` - add exported function
- `src/server/worktree/agent-worktree.ts` - update `getMainBranch` to delegate to it

### Changes

In `src/server/infra/git.ts` add after the existing exports:

```ts
export async function detectMainBranch(projectPath: string): Promise<string> {
  for (const name of ['main', 'master']) {
    const list = await git(projectPath, 'branch', '--list', name);
    if (list.trim()) return name;
  }
  throw new Error('Neither main nor master branch exists');
}
```

In `src/server/worktree/agent-worktree.ts`:
- Add import: `import { git, detectMainBranch } from '../infra/git.js';`
- Update `getMainBranch(projectPath)` to:
  - Accept an optional `configuredBranch?: string` parameter
  - When `configuredBranch` is provided and non-empty, return it directly
  - Otherwise call `detectMainBranch(projectPath)` and return its result

New signature:
```ts
async getMainBranch(projectPath: string, configuredBranch?: string): Promise<string>
```

### Acceptance criteria

- `detectMainBranch` is exported from `src/server/infra/git.ts`
- `AgentWorktreeManager.getMainBranch` returns the configured branch immediately when one is provided
- All existing `agent-worktree.test.ts` tests still pass unchanged — the `getMainBranch` tests call it without a second argument, so fallback behavior is preserved
- Unit tests for `detectMainBranch` are not required at this step; the existing integration tests in `agent-worktree.test.ts` cover it transitively

### Edge cases

- `configuredBranch` is an empty string: treat as absent, fall through to detection
- `configuredBranch` is whitespace-only: trim and treat as absent

---

## Step 2: Extend `ProjectEntry` and `ProjectRegistry.addProject`

### What

Add `mainBranch?: string` and `boardId?: string` to `ProjectEntry`. Store them in config.json on write. Read them back on load.

### Files

- `src/server/project/project-registry.ts`

### Changes

In the `ProjectEntry` interface (around line 13), add two fields:

```ts
export interface ProjectEntry {
  path: string;
  projectSlug: string;
  branch?: string;
  ticketsPath?: string;
  mainBranch?: string;
  boardId?: string;
}
```

In `ProjectInfo` interface (around line 5), add the same two fields so callers can read them back:

```ts
export interface ProjectInfo {
  path: string;
  projectSlug: string;
  available: boolean;
  branch?: string;
  ticketsPath?: string;
  mainBranch?: string;
  boardId?: string;
}
```

In `load()` (around line 104), in the `migratedProjects` mapping, add:

```ts
if (p.mainBranch !== undefined) entry.mainBranch = p.mainBranch as string;
if (p.boardId !== undefined) entry.boardId = p.boardId as string;
```

In `addProject` signature (around line 182), add two optional parameters:

```ts
addProject(
  projectPath: string,
  projectSlug?: string,
  branch?: string,
  ticketsPath?: string,
  mainBranch?: string,
  boardId?: string,
): ProjectInfo
```

In the `addProject` body where `entry` is constructed (around line 212):

```ts
if (mainBranch !== undefined) entry.mainBranch = mainBranch;
if (boardId !== undefined) entry.boardId = boardId;
```

In the return statement of `addProject`, include the new fields:

```ts
return {
  path: entry.path, projectSlug: entry.projectSlug, available: true,
  branch: entry.branch, ticketsPath: entry.ticketsPath,
  mainBranch: entry.mainBranch, boardId: entry.boardId,
};
```

In `listProjects()` (around line 168), include the new fields:

```ts
return this.load().projects.map((entry) => ({
  path: entry.path,
  projectSlug: entry.projectSlug,
  available: isGitRepo(entry.path, this.configRepo),
  branch: entry.branch,
  ticketsPath: entry.ticketsPath,
  mainBranch: entry.mainBranch,
  boardId: entry.boardId,
}));
```

### Acceptance criteria

- `addProject` called with `mainBranch` and `boardId` stores them in `config.json`
- `listProjects()` returns those fields
- `addProject` called without the new params leaves the fields absent from config.json (undefined, not null)
- Existing `project-registry.test.ts` tests still pass (no breaking signature change -- new params are optional)

### Edge cases

- If `mainBranch` or `boardId` is an empty string, do not store it (treat as undefined). Add a guard: `if (mainBranch?.trim()) entry.mainBranch = mainBranch.trim();` and same for `boardId`.

---

## Step 3: Extend `GET /api/projects` to return `mainBranch`

### What

The `GET /api/projects?previewPath=...` endpoint currently returns `{ projectSlug, ticketsPath, defaultWorktreesPath }`. Extend it to also return `mainBranch` by calling `detectMainBranch`. If detection fails (not a git repo, or neither branch found), return the error in the existing error-response shape.

### Files

- `src/routes/api/projects.ts`

### Changes

Add import of `detectMainBranch` at the top:

```ts
import { detectMainBranch } from '~/server/infra/git.js';
```

In the `GET` handler, after computing `projectSlug`, try to detect the main branch:

```ts
export const GET = withService(async ({ request }) => {
  const url = new URL(request.url);
  const pathValue = url.searchParams.get("previewPath");
  if (!pathValue) {
    return Response.json({ error: "Missing previewPath parameter" }, { status: 400 });
  }
  const existing = new Set(projectRegistry.listProjects().map((p) => p.projectSlug));
  const projectSlug = generateProjectSlug(pathValue, existing);
  let mainBranch: string | undefined;
  try {
    mainBranch = await detectMainBranch(pathValue);
  } catch {
    // Not a valid git repo or no main/master -- mainBranch stays undefined
  }
  return Response.json({
    projectSlug,
    ticketsPath: configPaths.ticketWorktreeDir(projectSlug),
    defaultWorktreesPath: configPaths.agentWorktreeDir(projectSlug),
    mainBranch,
  });
});
```

Note: The preview endpoint already returns an error if `previewPath` is missing. When the path is not a git repo, `detectMainBranch` will throw (git will fail). The field is simply absent from the response in that case -- the client handles `undefined`.

### Acceptance criteria

- `GET /api/projects?previewPath=<valid-git-repo-with-main>` returns `mainBranch: "main"`
- `GET /api/projects?previewPath=<valid-git-repo-with-master-only>` returns `mainBranch: "master"`
- `GET /api/projects?previewPath=<repo-with-develop-only>` returns response with no `mainBranch` field (or `mainBranch: undefined`)
- `GET /api/projects?previewPath=<non-git-path>` returns response with no `mainBranch` field
- Existing behaviour for `projectSlug`, `ticketsPath`, and `defaultWorktreesPath` is unchanged

### Edge cases

- The path string passed as `previewPath` may point to a non-existent directory; `git` will error; `detectMainBranch` throws; `mainBranch` is `undefined` in response
- Very slow git detection: the `git()` helper has a 30-second timeout -- acceptable for a preview call

---

## Step 4: Extend `POST /api/projects` to accept `mainBranch` and `boardId`

### What

The `POST /api/projects` handler reads `path`, `branch`, `worktreeRootPath`, `ticketsPath` from the request body. Extend it to also read `mainBranch` and `boardId`, and pass them to `projectRegistry.addProject`.

### Files

- `src/routes/api/projects.ts`

### Changes

Update the POST handler body destructuring and `addProject` call:

```ts
export const POST = withService(async ({ request }) => {
  const { path: pathValue, branch, worktreeRootPath, ticketsPath, mainBranch, boardId } =
    await request.json();
  const project = projectRegistry.addProject(
    pathValue, undefined, branch, ticketsPath?.trim() || undefined,
    mainBranch?.trim() || undefined, boardId?.trim() || undefined,
  );
  const trimmedRoot = worktreeRootPath?.trim();
  if (trimmedRoot) {
    configRepo.ensureDir(trimmedRoot);
    launcherConfigManager.saveWorktreeRootPath(project.projectSlug, trimmedRoot);
  }
  return Response.json({ projectSlug: project.projectSlug });
});
```

Note: `boardId` in ProjectEntry is distinct from `boardId` in LauncherConfig (which is the existing per-project launcher config field used by `getMergedConfig`). Per the PRD, only new projects get `boardId` in `ProjectEntry`. The existing `LauncherConfigManager.saveWorktreeRootPath` pattern is left untouched.

### Acceptance criteria

- `POST /api/projects` with `mainBranch: "develop"` saves `mainBranch: "develop"` in config.json's project entry
- `POST /api/projects` with `boardId: "kanban"` saves `boardId: "kanban"` in config.json's project entry
- Omitting either field leaves it absent from config.json (not `null`)
- Existing behaviour for all other fields is unchanged

---

## Step 5: Extend `ProjectPathsPreview` and `applyPreview`

### What

`ProjectPathsPreview` in `src/components/project/add-project-pure.ts` needs a `mainBranch?: string` field. `applyPreview` needs a `mainBranchTouched` parameter and must return `mainBranch?: string` in its result object.

### Files

- `src/components/project/add-project-pure.ts`
- `src/components/project/add-project-pure.test.ts`

### Changes to `add-project-pure.ts`

```ts
export interface ProjectPathsPreview {
  projectSlug: string;
  ticketsPath: string;
  defaultWorktreesPath: string;
  mainBranch?: string;
}

export function applyPreview(
  preview: ProjectPathsPreview | null,
  ticketsTouched: boolean,
  worktreeTouched: boolean,
  mainBranchTouched: boolean,
): { ticketsRootPath?: string; worktreeRootPath?: string; mainBranch?: string } {
  if (!preview) return {};
  const result: { ticketsRootPath?: string; worktreeRootPath?: string; mainBranch?: string } = {};
  if (!ticketsTouched) result.ticketsRootPath = preview.ticketsPath;
  if (!worktreeTouched) result.worktreeRootPath = preview.defaultWorktreesPath;
  if (!mainBranchTouched && preview.mainBranch !== undefined) result.mainBranch = preview.mainBranch;
  return result;
}
```

### Changes to `add-project-pure.test.ts`

Update all existing calls to `applyPreview` to pass a fourth argument `false`:

```ts
applyPreview(preview, false, false, false)
applyPreview(preview, true, false, false)
applyPreview(preview, false, true, false)
applyPreview(preview, true, true, false)
applyPreview(null, false, false, false)
```

Add new tests covering `mainBranchTouched` and `mainBranch` field:

- When not touched and preview has `mainBranch`, result includes `mainBranch`
- When touched, result excludes `mainBranch` even if preview has it
- When preview has no `mainBranch` field, result excludes `mainBranch` regardless of touched

### Acceptance criteria

- All pre-existing `applyPreview` tests pass with the updated signature
- New tests added for `mainBranchTouched` and the `mainBranch` result field

---

## Step 6: Update `AddProjectController` and `AddProjectControllerDeps`

### What

The controller needs to:
1. Fetch the board list once on mount via `GET /api/boards`
2. Hold a `mainBranchValue` signal with a `mainBranchTouched` flag (same "touched" pattern as tickets/worktree)
3. Hold a `boardId` signal (string, defaults to first board's id)
4. Apply `mainBranch` from preview when not touched
5. Pass `mainBranch` and `boardId` to the `action` function

### Files

- `src/components/project/add-project-controller.ts`

### Changes

Update `AddProjectControllerDeps`:

```ts
export interface AddProjectControllerDeps {
  action: (
    path: string,
    branch: string,
    worktreeRootPath: string,
    ticketsPath: string,
    mainBranch: string,
    boardId: string,
  ) => Promise<{ projectSlug?: string; error?: string }>;
  onSuccess?: (projectSlug: string) => void;
  errorMessage?: string;
}
```

Add signals for `mainBranchValue`, `mainBranchTouched`, `boardId`, and `boards` list. Import `BoardDefinition` type from `~/server/project/board-config.js` or define a minimal inline type `{ id: string; name: string }[]` to avoid a server import in client code. Use the inline type.

Add fetch for boards on mount using `createEffect` with no dependency (runs once). On success, if `boardId` signal is still empty, set it to `boards[0].id`.

Update the `applyPreview` call to pass `mainBranchTouched()` as the fourth argument, and apply `mainBranch` from the result.

Add `setMainBranchValue` that also sets `mainBranchTouched(true)`.

Update `handleSubmit` to pass `mainBranchValue().trim()` and `boardId()` to `deps.action`.

Return the new signals/commands:

```ts
return {
  // existing...
  mainBranchValue, boardId, boards,
  setMainBranchValue: (v: string) => { setMainBranchTouched(true); setMainBranchValue(v); },
  setBoardId,
  handleSubmit,
  // ...
};
```

Full updated `createEffect` for preview application:

```ts
createEffect(() => {
  const applied = applyPreview(preview(), ticketsTouched(), worktreeTouched(), mainBranchTouched());
  if (applied.ticketsRootPath !== undefined) setTicketsRootPath(applied.ticketsRootPath);
  if (applied.worktreeRootPath !== undefined) setWorktreeRootPath(applied.worktreeRootPath);
  if (applied.mainBranch !== undefined) setMainBranchValue(applied.mainBranch);
});
```

Note: When setting `mainBranchValue` from preview inside the effect, do NOT call `setMainBranchTouched(true)` -- the internal setter `setMainBranchValue` is used directly (not the exported `setMainBranchValue` command).

Board fetch effect (runs once on truthy debounced path, or simply at mount):

```ts
const [boards, setBoards] = createSignal<{ id: string; name: string }[]>([]);
const [boardId, setBoardId] = createSignal("");

// Fetch boards once at component mount
fetch('/api/boards')
  .then((res) => res.json())
  .then((data: { id: string; name: string }[]) => {
    setBoards(data);
    if (!boardId()) setBoardId(data[0]?.id ?? "");
  })
  .catch((err: any) => setLocalError(err?.message ?? "Failed to load boards"));
```

This must be called inside `createAddProjectController` but outside any reactive effect so it runs once. Use a `createResource` or plain `fetch` in the constructor body -- a plain `fetch` at call time is sufficient.

### Acceptance criteria

- `boards` signal is populated with the board list from `GET /api/boards`
- `boardId` defaults to `boards[0].id`
- After path is entered, `mainBranchValue` is auto-filled from the preview
- Manually editing `mainBranchValue` prevents subsequent previews from overwriting it
- `handleSubmit` passes `mainBranchValue` and `boardId` to `deps.action`
- If board fetch fails, `localError` is set and boards signal is empty

---

## Step 7: Update `addProjectAction` in `src/lib/add-project.ts`

### What

The `addProjectAction` function needs to accept and forward `mainBranch` and `boardId`.

### Files

- `src/lib/add-project.ts`

### Changes

```ts
export async function addProjectAction(
  pathValue: string,
  branch?: string,
  worktreeRootPath?: string,
  ticketsPath?: string,
  mainBranch?: string,
  boardId?: string,
): Promise<{ projectSlug?: string; error?: string }> {
  return apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: pathValue, branch, worktreeRootPath, ticketsPath, mainBranch, boardId }),
  }, "Failed to add project");
}
```

### Acceptance criteria

- The function signature now includes `mainBranch` and `boardId` as optional trailing parameters
- They are forwarded in the JSON body

---

## Step 8: Update `AddProjectForm.tsx`

### What

Add the Board Definition `<select>` and the main branch `<input>` to the form, between the Git Repository Path block and the Tickets branch name block. Update `AddProjectFormProps.action` to match the new signature.

### Files

- `src/components/project/AddProjectForm.tsx`

### Changes

Update `AddProjectFormProps.action` type:

```ts
interface AddProjectFormProps {
  action: (
    path: string,
    branch: string,
    worktreeRootPath: string,
    ticketsPath: string,
    mainBranch: string,
    boardId: string,
  ) => Promise<{ projectSlug?: string; error?: string }>;
  errorMessage?: string;
  onSuccess?: (projectSlug: string) => void;
  submitTitle?: string;
  ctrl?: AddProjectController;
}
```

Between the "Git Repository Path" block and the "Tickets branch name" block, insert:

Board Definition select (only rendered when `s.boards().length > 1`; when there is only one board, there is nothing to choose, so the field is omitted):

```tsx
<Show when={s.boards().length > 1}>
  <div class="mb-4">
    <label for="project-board" class="mb-2 block text-sm font-medium">Board Definition</label>
    <select
      id="project-board"
      value={s.boardId()}
      onChange={(e) => s.setBoardId(e.currentTarget.value)}
      class="input"
      data-testid="add-project-board-select"
    >
      <For each={s.boards()}>
        {(board) => <option value={board.id}>{board.name}</option>}
      </For>
    </select>
  </div>
</Show>
```

Import `Show` and `For` from `solid-js`.

Main branch input (always rendered):

```tsx
<div class="mb-4">
  <label for="project-main-branch" class="mb-2 block text-sm font-medium">Main branch</label>
  <input
    id="project-main-branch"
    type="text"
    value={s.mainBranchValue()}
    onInput={(e) => s.setMainBranchValue(e.currentTarget.value)}
    placeholder="Auto-detected from repository"
    class="input"
    data-testid="add-project-main-branch-input"
  />
</div>
```

Final field order in the form:
1. Git Repository Path (with Browse)
2. Board Definition `<select>` (when > 1 board)
3. Main branch input
4. Tickets branch name
5. Tickets folder (with Browse)
6. Agent worktree root path (with Browse)

### Acceptance criteria

- Board dropdown is rendered when the server returns > 1 board
- Board dropdown is hidden when there is exactly 1 board
- Main branch input is always rendered
- Main branch is auto-filled from preview, then locked on manual edit
- Field tab order matches the specified layout order

---

## Step 9: Update `add-project.tsx` route page

### What

The `AddProjectPage` passes `addProjectAction` as the `action` prop. The action signature now takes two extra trailing parameters. Since `AddProjectForm` passes through to the controller which calls `action(path, branch, worktreeRoot, ticketsPath, mainBranch, boardId)`, no change to the page file is needed IF `addProjectAction` is updated to accept the new parameters (done in Step 7).

Verify that `src/routes/add-project.tsx` does not inline a local wrapper that would need updating.

### Files

- `src/routes/add-project.tsx` -- verify only, no changes expected

### Acceptance criteria

- `npm run tsc` passes (type-check)

---

## Step 10: Unit tests for `add-project-pure.ts`

### What

All existing tests in `src/components/project/add-project-pure.test.ts` must be updated to pass the new fourth argument. New test cases added for `mainBranchTouched` behavior.

### Files

- `src/components/project/add-project-pure.test.ts`

### Changes

Update all five existing `applyPreview(...)` calls to include the fourth argument `false`.

Add a new `describe` block or extend the existing one with:

```ts
it("returns mainBranch from preview when not touched", () => {
  expect(applyPreview({ ...preview, mainBranch: "develop" }, false, false, false))
    .toMatchObject({ mainBranch: "develop" });
});

it("omits mainBranch when touched", () => {
  const result = applyPreview({ ...preview, mainBranch: "develop" }, false, false, true);
  expect("mainBranch" in result).toBe(false);
});

it("omits mainBranch when preview has no mainBranch", () => {
  const result = applyPreview(preview, false, false, false);
  expect("mainBranch" in result).toBe(false);
});
```

### Acceptance criteria

- All existing tests pass (with updated call signatures)
- New tests cover all three cases above

---

## Step 11: Unit tests for `ProjectRegistry.addProject` with new fields

### What

Add tests to `src/server/project/project-registry.test.ts` for the new `mainBranch` and `boardId` parameters.

### Files

- `src/server/project/project-registry.test.ts`

### New tests

```ts
it("addProject stores mainBranch and boardId when provided", () => {
  // setup, call addProject with mainBranch: "develop" and boardId: "kanban"
  // check info.mainBranch === "develop" and info.boardId === "kanban"
  // check listProjects() returns them
  // check config.json on disk has them
});

it("addProject without mainBranch and boardId leaves fields absent from config.json", () => {
  // call addProject without them
  // check "mainBranch" not in config.json projects[0]
  // check "boardId" not in config.json projects[0]
});
```

Follow the exact pattern of the existing `addProject stores the chosen branch and listProjects returns it` test at line 487.

### Acceptance criteria

- Two new tests pass
- No existing tests broken

---

## Step 12: e2e test updates and new e2e test

### What

1. Update `e2e/fixtures.ts` to add `mainBranch?` and `boardId?` to `ProjectRegistryShape` so assertions can read them
2. Update `e2e/add-project.test.ts` to cover the new form fields
3. Optionally: update `createProject` in `fixtures.ts` to accept and pass `boardId` and `mainBranch` when seeding through the API (for future tests)

### Files

- `e2e/fixtures.ts`
- `e2e/add-project.test.ts`

### Changes to `fixtures.ts`

In `ProjectRegistryShape` (around line 430):

```ts
export interface ProjectRegistryShape {
  projects: {
    path: string;
    projectSlug: string;
    branch?: string;
    ticketsPath?: string;
    mainBranch?: string;
    boardId?: string;
  }[];
  lastUsedProjectSlug: string | null;
  lastUsedProfileName?: string | null;
}
```

### Changes to `add-project.test.ts`

The existing "submit registers the project" test initialises `repoDir` with `git init` (no `-b` flag, so defaults to `main` or `master` depending on the git version). Add assertions on `mainBranch` in the registry after submit.

The `makeRepo()` helper creates a repo with `git init` (no explicit branch). To make this deterministic, change it to `git init -b main`.

Add a new test: "main branch input is auto-filled after entering a valid path":

```ts
it("main branch input is auto-filled after entering a valid path", async () => {
  await page.goto(`${testServer.baseUrl}/add-project`);
  await page.waitForSelector('[data-testid="add-project-path-input"]', { state: "visible", timeout: 10000 });
  await page.locator('[data-testid="add-project-path-input"]').fill(repoDir);
  await page.waitForFunction(
    () => {
      const v = (document.querySelector('[data-testid="add-project-main-branch-input"]') as HTMLInputElement | null)?.value ?? "";
      return v.length > 0;
    },
    { timeout: 10000 },
  );
  const mainBranch = await page.locator('[data-testid="add-project-main-branch-input"]').inputValue();
  expect(mainBranch).toBe("main");
}, 60000);
```

Add a new test: "submit stores mainBranch in config.json":

Update the existing submit test OR add alongside it:

```ts
it("submit stores mainBranch and boardId in config.json", async () => {
  await page.goto(`${testServer.baseUrl}/add-project`);
  await page.waitForSelector('[data-testid="add-project-path-input"]', { state: "visible", timeout: 10000 });
  await page.locator('[data-testid="add-project-path-input"]').fill(repoDir);
  await page.waitForFunction(
    () => {
      const v = (document.querySelector('[data-testid="add-project-main-branch-input"]') as HTMLInputElement | null)?.value ?? "";
      return v.length > 0;
    },
    { timeout: 10000 },
  );
  await page.locator('[data-testid="add-project-submit"]').click();
  await page.waitForSelector('[data-testid="project-header-settings-button"]', {
    state: "visible", timeout: 15000,
  });
  const registry = readProjectRegistry(testServer);
  expect(registry.projects[0].mainBranch).toBe("main");
  // boardId should be the first board's id
  expect(typeof registry.projects[0].boardId).toBe("string");
}, 60000);
```

Note: Since `repoDir` is shared across tests, each test that submits must use a fresh server or reuse the same `testServer` which has no projects at start. The existing test already registers a project. To avoid collision, either run submit tests in isolated server instances or use separate `repoDir` values. Match the pattern already used in `add-project.test.ts` -- the existing submit test creates the only project, so the new submit test should run in a separate `describe` block with its own `testServer` and `repoDir`.

### Acceptance criteria

- `readProjectRegistry` can access `mainBranch` and `boardId` without TypeScript errors
- New test: main branch input auto-fills from the preview
- New test: submit persists `mainBranch` in config.json

---

## Step 13: Update `AgentWorktreeManager` usage in existing callers

### What

`ensureAgentWorktree` calls `this.getMainBranch(projectPath)` internally (line 62). This is fine -- the configured branch lives in `ProjectEntry` which is stored in config.json. `ensureAgentWorktree` does not currently read ProjectEntry; it only reads `LauncherConfig` for `worktreeRootPath`. Per the PRD, `getMainBranch` accepts the configured branch as an optional parameter. The caller would need to look it up.

However, the PRD states `getMainBranch` is updated but the PRD does not specify that `ensureAgentWorktree` automatically reads the new field. Check the PRD:

> `getMainBranch` is updated to accept an optional configured main branch name. When provided, it uses that value directly instead of probing.

The change in Step 1 adds the parameter. No existing callers pass it, so all existing calls remain unchanged and still auto-detect. The feature becomes available for future call sites or for callers that pass the value.

No changes to existing callers are required in this ticket. The test at `agent-worktree.test.ts` line 101 ("falls back from main to master") and line 105 ("throws when neither main nor master exists") remain valid because they call `getMainBranch` without a second argument.

### Files

None (validation only)

### Acceptance criteria

- `npm run test:all` passes, meaning `agent-worktree.test.ts` still passes

---

## Execution order

The steps must be executed in this order due to dependencies:

1. Step 1 (extract `detectMainBranch`) -- no deps
2. Step 2 (extend `ProjectEntry`) -- no deps on Step 1
3. Step 3 (extend GET /api/projects) -- depends on Step 1
4. Step 4 (extend POST /api/projects) -- depends on Step 2
5. Step 5 (extend `applyPreview`) -- no deps on backend steps
6. Step 6 (extend controller) -- depends on Step 5
7. Step 7 (extend `addProjectAction`) -- no deps
8. Step 8 (update `AddProjectForm.tsx`) -- depends on Steps 6, 7
9. Step 9 (verify route page) -- depends on Step 7
10. Step 10 (pure function tests) -- depends on Step 5
11. Step 11 (registry unit tests) -- depends on Step 2
12. Step 12 (e2e tests) -- depends on all prior steps

---

## Full list of files to create or modify

Modified:

- `src/server/infra/git.ts` -- add `detectMainBranch`
- `src/server/worktree/agent-worktree.ts` -- update `getMainBranch` signature and import
- `src/server/project/project-registry.ts` -- add fields to `ProjectEntry`, `ProjectInfo`, `addProject`, `listProjects`, `load`
- `src/routes/api/projects.ts` -- extend GET and POST handlers
- `src/components/project/add-project-pure.ts` -- extend `ProjectPathsPreview`, `applyPreview`
- `src/components/project/add-project-pure.test.ts` -- update call sites and add tests
- `src/components/project/add-project-controller.ts` -- boards fetch, mainBranch signals, updated submit
- `src/lib/add-project.ts` -- add `mainBranch`, `boardId` params
- `src/components/project/AddProjectForm.tsx` -- add two new fields, update `action` type
- `src/server/project/project-registry.test.ts` -- two new tests
- `e2e/fixtures.ts` -- extend `ProjectRegistryShape`
- `e2e/add-project.test.ts` -- new tests and assertions

Created: none

---

## Key invariants to preserve

- The `boardId` stored in `ProjectEntry` (config.json) is distinct from `boardId` in `LauncherConfig` (per-project `launcher-config.json`). The PRD explicitly says "Migrating the existing boardId out of Launcher Config" is out of scope.
- The `launcherConfigManager.saveWorktreeRootPath` call in the POST handler is unchanged.
- All existing `project-registry.test.ts` tests pass with the new optional parameters.
- All existing `agent-worktree.test.ts` tests pass because `getMainBranch` without a second argument still probes for main/master.
- The "touched" pattern: `setMainBranchValue` exported from the controller sets `mainBranchTouched(true)`. The internal assignment from preview does NOT set `mainBranchTouched`.
- `applyPreview` is a pure function with no side effects; the controller wires it in `createEffect`.
