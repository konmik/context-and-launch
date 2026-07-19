# ST-0026 Detailed Implementation Plan

## Overview

Add Valibot v1 as a runtime validation library. Define shared request schemas co-located with domain types. Build a `validated()` wrapper in route-helpers.ts that composes with existing wrappers (withService, withProject, withTicketStore). Migrate route files to eliminate hand-rolled validation. Type client fetch call sites with shared request types.

## Codebase orientation

Working directory: `C:\Users\elkmo\.context-launch\projects\ai-stages\worktrees\st-0026-typed-api-contracts-and-route-helper`

Key files:
- Route helpers: `src/server/shared/route-helpers.ts` (withService, withProject, withTicketStore)
- Launcher-config route helper: `src/server/shared/launcher-config-routes.ts` (itemRoutes, skillReorderRoute)
- Error types: `src/server/shared/errors.ts` (ValidationError, AppError, PayloadError)
- Domain types: `src/server/ticket/ticket-store.ts`, `src/server/board/board-types.ts`, `src/server/launcher/launcher-config.ts`, `src/server/project/board-config.ts`, `src/server/project/project-registry.ts`
- Route files: ~47 files under `src/routes/api/`
- Client call sites: `src/components/ticket/ticket-detail-state.ts`, `src/components/ticket/ticket-detail-header.ts`, `src/components/ticket/ticket-detail-shortcuts.ts`, `src/components/project/project-page-controller.ts`, `src/components/launcher/launcher-settings-state.ts`, `src/components/project/add-project-controller.ts`, `src/components/shared/conflict-dialog-controller.ts`, `src/lib/fetch-boards.ts`, `src/lib/last-used-profile.ts`, `src/lib/delete-project.ts`, `src/lib/sync-pending-poller.ts`
- API utility: `src/lib/api.ts` (apiFetch helper)

Project rules (from CLAUDE.md):
- No comments unless explicitly asked
- Never use bare "slug" as a field name; qualify it (projectSlug, columnSlug, etc.)
- Pin exact dependency versions (no ^ or ~)
- No underscore or bold markdown in md files
- Do not add Co-Authored-By lines to commit messages

## Step 1: Install Valibot

Depends on: nothing

Files modified:
- `package.json`

Actions:
1. Run `npm install valibot@1.4.1 --save-exact`
2. Verify `package.json` shows `"valibot": "1.4.1"` (no ^ or ~)

Acceptance criteria:
- `valibot` appears in `dependencies` at exact version 1.4.1
- `npm ls valibot` exits 0
- `tsc --noEmit` still passes

## Step 2: Build the validated() wrapper

Depends on: Step 1

Files modified:
- `src/server/shared/route-helpers.ts`

Actions:
1. Add a `validated()` function that takes a Valibot schema and a handler function. It must:
   - Call `request.json()` to parse the body
   - Run `v.parse(schema, body)` against the parsed body
   - If parsing succeeds, call the handler with the typed body
   - If parsing fails (ValiError), throw a `ValidationError` with the first issue's message
   - Compose as the innermost wrapper: `withTicketStore(validated(Schema, (ctx, body) => ...))` or `withProject(validated(Schema, (ctx, body) => ...))` or used standalone inside a `withService` handler

2. The function signature must work with three wrappers:
   - For `withTicketStore`: handler receives `(ctx: TicketContext, body: T)` and the second parameter from withTicketStore is `request: Request`, so validated wraps the request
   - For `withProject`: handler receives `(ctx: ProjectContext, body: T)` and the second parameter is `request: Request`
   - For `withService`: handler receives `(event: APIEvent, body: T)` or body is parsed within a withService handler block

Design the validated() function to replace the `(ctx, request) => ...` handler pattern. It wraps a `(ctx, body: T) => Promise<Response>` and returns a `(ctx, request: Request) => Promise<Response>`. This way it slots into both withProject and withTicketStore which both pass `(ctx, request)` to their handler.

Concrete signature:

```typescript
import * as v from "valibot";
import type { GenericSchema } from "valibot";

export function validated<TCtx, TSchema extends GenericSchema>(
  schema: TSchema,
  handler: (ctx: TCtx, body: v.InferOutput<TSchema>) => Promise<Response>,
): (ctx: TCtx, request: Request) => Promise<Response> {
  return async (ctx: TCtx, request: Request) => {
    const raw = await request.json();
    const body = v.parse(schema, raw);
    return handler(ctx, body);
  };
}
```

Note: v.parse throws `ValiError` on failure. The outer wrapper (withProject, withTicketStore) catches all errors. ValiError is an Error subclass, so `errorMessage(e)` returns the message. But its status should be 400. Two approaches:
- Catch ValiError in validated() and re-throw as ValidationError (400). This is preferred since it gives a clear 400 status.
- Let it bubble up and rely on the outer wrapper's default status. This would give 500 for withService or withProject, which is wrong.

Go with approach A: catch ValiError, re-throw as ValidationError.

```typescript
import { ValiError } from "valibot";

export function validated<TCtx, TSchema extends GenericSchema>(
  schema: TSchema,
  handler: (ctx: TCtx, body: v.InferOutput<TSchema>) => Promise<Response>,
): (ctx: TCtx, request: Request) => Promise<Response> {
  return async (ctx: TCtx, request: Request) => {
    const raw = await request.json();
    let body: v.InferOutput<TSchema>;
    try {
      body = v.parse(schema, raw);
    } catch (e) {
      if (e instanceof ValiError) {
        throw new ValidationError(e.issues[0]?.message ?? "Invalid request body");
      }
      throw e;
    }
    return handler(ctx, body);
  };
}
```

3. Also add an overload for withService usage where the handler receives `(event: APIEvent, body: T)`. Since withService passes `(event: APIEvent)`, validated() needs a different shape. Actually, withService does not split `(ctx, request)` -- it passes `(event: APIEvent)`. So for withService routes, the pattern is:

```typescript
export const PUT = withService(async ({ params, request }) => {
  // parse body manually
});
```

For withService routes, validated() cannot wrap the handler the same way. Two options:
- A standalone `parseBody()` helper that parses and validates, returns typed body
- A different overload of validated()

Since withService routes receive `(event: APIEvent)` as a single arg, and the request is inside event.request, the simplest approach is a `parseBody()` utility:

```typescript
export async function parseBody<TSchema extends GenericSchema>(
  request: Request,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  const raw = await request.json();
  try {
    return v.parse(schema, raw);
  } catch (e) {
    if (e instanceof ValiError) {
      throw new ValidationError(e.issues[0]?.message ?? "Invalid request body");
    }
    throw e;
  }
}
```

Routes using withService would call:
```typescript
export const PUT = withService(async ({ params, request }) => {
  const body = await parseBody(request, SomeSchema);
  // use body...
});
```

This replaces the current pattern of `const body = await request.json(); if (!name || typeof name !== "string") throw new ValidationError(...)`.

Export both `validated` (for withProject/withTicketStore) and `parseBody` (for withService).

Acceptance criteria:
- `validated()` composes with withTicketStore and withProject
- `parseBody()` works inside withService handlers
- ValiError is caught and re-thrown as ValidationError (status 400)
- `tsc --noEmit` passes
- Existing tests still pass

## Step 3: Define request schemas co-located with domain types

Depends on: Step 1

This step defines all Valibot schemas for request bodies. Each schema is co-located with the domain types it describes. Each schema is exported both as a runtime schema object and as an inferred TypeScript type (via `v.InferOutput`).

### 3A: Ticket request schemas

File: `src/server/ticket/ticket-store.ts`

Replace the manually-defined `CreateTicketRequest` and `UpdateTicketRequest` interfaces with Valibot schemas. Also add schemas for other ticket-related request bodies used in routes.

Schemas to define:

1. `CreateTicketBody` -- replaces `CreateTicketRequest` interface
   - `number`: `v.string()` (required)
   - `title`: `v.string()` (required)

2. `UpdateTicketBody` -- replaces `UpdateTicketRequest` interface
   - `number`: `v.optional(v.string())`
   - `title`: `v.optional(v.string())`
   - `status`: `v.optional(v.string())`

3. `SaveContextBody` -- for PUT context/[name]
   - `content`: `v.string()`

4. `UseWorktreeBody` -- for PUT use-worktree
   - `useWorktree`: `v.boolean()`

5. `AddReferencesBody` -- for POST references
   - `paths`: `v.optional(v.array(v.string()), [])`

6. `RemoveReferenceBody` -- for DELETE references
   - `path`: `v.string()`

7. `ReorderTicketBody` -- for POST reorder
   - `folderName`: `v.string()`
   - `fromColumn`: `v.string()`
   - `toColumn`: `v.string()`
   - `newIndex`: `v.number()`

Remove the old `CreateTicketRequest` and `UpdateTicketRequest` interfaces. Also remove `DocContent` interface (replaced by `SaveContextBody`). Export `type CreateTicketBody = v.InferOutput<typeof CreateTicketBody>` for each schema.

Note: The existing interfaces `CreateTicketRequest` and `UpdateTicketRequest` are only used internally in ticket-store.ts type definitions. Search for imports of these interfaces from client code. Check if any client code imports `CreateTicketRequest` or `UpdateTicketRequest` or `DocContent`.

After checking: `CreateTicketRequest` and `UpdateTicketRequest` are defined but not imported anywhere else in the codebase. `DocContent` is also only defined, not imported. Safe to replace.

### 3B: Board request schemas

File: `src/server/board/board-types.ts`

Add schemas for board/column route request bodies:

1. `CreateBoardBody`
   - `name`: `v.pipe(v.string(), v.nonEmpty("Missing required field: name"))`

2. `RenameBoardBody`
   - `name`: `v.pipe(v.string(), v.nonEmpty("Missing required field: name"))`

3. `AddColumnBody`
   - `name`: `v.pipe(v.string(), v.nonEmpty("Missing required field: name"))`
   - `description`: `v.optional(v.string())`

4. `UpdateColumnBody`
   - `description`: `v.optional(v.string())`

5. `ReorderColumnsBody`
   - `columns`: `v.array(v.string())`

6. `RenameColumnBody`
   - `newName`: `v.pipe(v.string(), v.nonEmpty("Missing required field: newName"))`
   - `scope`: `v.picklist(["all", "current", "none"])`
   - `currentProjectSlug`: `v.optional(v.string())`

### 3C: Launcher config request schemas

File: `src/server/launcher/launcher-config.ts`

Add schemas for launcher-config route request bodies:

1. `SetBoardIdBody`
   - `boardId`: `v.pipe(v.string(), v.nonEmpty("Missing required field: boardId"))`

2. `SetProjectNameBody`
   - `name`: `v.string()`

3. `WorktreeRootPathBody`
   - `worktreeRootPath`: `v.optional(v.string())`

4. `ConflictResolutionBody`
   - `conflictResolutionPrompt`: `v.optional(v.string())`

5. `ColumnDefaultsBody`
   - `column`: `v.string()`
   - Plus partial LauncherColumnDefaults fields: `templateName`, `checkedSkills`, `profileName`, `lastLayer`, `skillOrder` -- all optional

6. `ProfileNameBody` (for last-used-profile)
   - `profileName`: `v.pipe(v.string(), v.nonEmpty("profileName is required"))`

7. `ResolveConflictsBody`
   - `profileName`: `v.pipe(v.string(), v.nonEmpty("No profile selected"))`

### 3D: Project request schemas

File: `src/server/project/project-registry.ts`

1. `AddProjectBody`
   - `path`: `v.string()`
   - `branch`: `v.optional(v.string())`
   - `mainBranch`: `v.optional(v.string())`
   - `boardId`: `v.optional(v.string())`
   - `name`: `v.optional(v.string())`

### 3E: Worktree cleanup request schema

File: `src/server/worktree/worktree-cleanup.ts` or inline in the route since it is only used once. Co-locate with the nearest domain type.

1. `WorktreeCleanupBody`
   - `folderName`: `v.string()`
   - `options`: `v.object({ deleteWorktree: v.boolean(), deleteLocalBranch: v.boolean(), deleteRemoteBranch: v.boolean() })`

### 3F: Open config dir request schema

File: `src/server/shared/route-helpers.ts` or define inline. Since it is used by one route, define in the route file itself or in a shared location. Given the PRD says co-locate with domain types, and this is a generic utility, define it in the route file.

1. `OpenConfigDirBody`
   - `scope`: `v.optional(v.string())`
   - `projectSlug`: `v.optional(v.string())`

### 3G: Launcher-config item routes schemas

File: `src/server/shared/launcher-config-routes.ts`

Schemas for the itemRoutes() pattern:

1. `ItemAddBody` (POST)
   - `name`: `v.string()`
   - `text`: `v.optional(v.string())`
   - `command`: `v.optional(v.string())`

2. `ItemUpdateBody` (PUT)
   - `oldName`: `v.string()`
   - `name`: `v.string()`
   - `text`: `v.optional(v.string())`
   - `command`: `v.optional(v.string())`

3. `ItemDeleteBody` (DELETE)
   - `name`: `v.string()`

4. `SkillReorderBody` (PUT reorder)
   - `name`: `v.string()`
   - `order`: `v.number()`

### 3H: Shortcut run request schema

File: `src/server/launcher/launcher-config.ts` (co-located with LauncherShortcut)

1. `RunShortcutBody`
   - `name`: `v.string()`
   - `useWorktree`: `v.optional(v.boolean(), false)`
   - `force`: `v.optional(v.boolean(), false)`

Acceptance criteria:
- All schemas compile with `tsc --noEmit`
- Each schema has both a runtime export and a type export
- No manual TypeScript interfaces remain for request body types that now have schemas
- Schemas are co-located with domain types as described in the PRD

## Step 4: Migrate route files to use validated() and parseBody()

Depends on: Steps 2 and 3

Migrate routes in order of duplication density. Routes that do not parse a request body (GET, DELETE with no body) are left unchanged.

### 4A: Ticket routes (highest duplication)

Files:
- `src/routes/api/projects/[projectSlug]/board/tickets.ts` -- POST uses CreateTicketBody
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName].ts` -- PUT uses UpdateTicketBody
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/context/[name].ts` -- PUT uses SaveContextBody
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/use-worktree.ts` -- PUT uses UseWorktreeBody
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/references.ts` -- POST uses AddReferencesBody, DELETE uses RemoveReferenceBody
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/archive.ts` -- POST, no body, skip
- `src/routes/api/projects/[projectSlug]/board/reorder.ts` -- POST uses ReorderTicketBody

For routes using withTicketStore, change:
```typescript
// Before
export const PUT = withTicketStore(async (ctx, request) => {
  const body = await request.json();
  const { number, title, status } = body as Record<string, unknown>;
  if (number != null && typeof number !== "string") return new Response(...);
  ...
});

// After
export const PUT = withTicketStore(validated(UpdateTicketBody, async (ctx, body) => {
  const updated = ctx.store.updateTicket(ctx.folderName, body.number ?? null, body.title ?? null, body.status ?? null);
  return Response.json({ success: true, folderName: updated.folderName });
}));
```

For reorder.ts using withTicketStore:
```typescript
// Before
export const POST = withTicketStore(async (ctx, request) => {
  const { folderName, fromColumn, toColumn, newIndex } = await request.json();
  ...
});

// After
export const POST = withTicketStore(validated(ReorderTicketBody, async (ctx, body) => {
  ctx.store.moveTicket(body.folderName, body.fromColumn, body.toColumn, body.newIndex);
  return Response.json({ success: true });
}));
```

For tickets.ts (POST) using withProject, the pattern is slightly different because it also needs to call boardConfigManager. Use validated():
```typescript
export const POST = withProject(validated(CreateTicketBody, async (ctx, body) => {
  const boardId = projectRegistry.getBoardId(ctx.projectSlug);
  const columns = boardConfigManager.getConfig(boardId).columns;
  if (columns.length === 0) return new Response("Board has no columns configured", { status: 400 });
  new TicketStore(ctx.worktreeDir).createTicket(body.number, body.title, columns[0].name);
  return Response.json({ success: true });
}));
```

### 4B: Board and column routes

Files:
- `src/routes/api/boards.ts` -- POST uses CreateBoardBody
- `src/routes/api/boards/[boardId].ts` -- PUT uses RenameBoardBody
- `src/routes/api/boards/[boardId]/columns.ts` -- POST uses AddColumnBody
- `src/routes/api/boards/[boardId]/columns/[columnName].ts` -- PUT uses UpdateColumnBody
- `src/routes/api/boards/[boardId]/columns/[columnName]/rename.ts` -- POST uses RenameColumnBody
- `src/routes/api/boards/[boardId]/columns/reorder.ts` -- PUT uses ReorderColumnsBody

These use withService, so use parseBody():
```typescript
// Before
export const POST = withService(async ({ request }) => {
  const { name } = await request.json();
  if (!name || typeof name !== "string") throw new ValidationError("Missing required field: name");
  ...
});

// After
export const POST = withService(async ({ request }) => {
  const { name } = await parseBody(request, CreateBoardBody);
  ...
});
```

### 4C: Project routes

Files:
- `src/routes/api/projects.ts` -- POST uses AddProjectBody
- `src/routes/api/projects/[projectSlug]/board-id.ts` -- PUT uses SetBoardIdBody
- `src/routes/api/projects/[projectSlug]/name.ts` -- PUT uses SetProjectNameBody
- `src/routes/api/projects/[projectSlug]/worktree-cleanup.ts` -- POST uses WorktreeCleanupBody

### 4D: Launcher config routes

Files:
- `src/routes/api/projects/[projectSlug]/launcher-config/column-defaults.ts` -- PUT uses ColumnDefaultsBody
- `src/routes/api/projects/[projectSlug]/launcher-config/conflict-resolution.ts` -- PUT uses ConflictResolutionBody
- `src/routes/api/projects/[projectSlug]/launcher-config/worktree-root-path.ts` -- PUT uses WorktreeRootPathBody
- `src/routes/api/projects/[projectSlug]/launcher-config.ts` -- PUT (saves full config), uses LauncherConfig type. This route saves the entire config object; define a schema or leave as-is since it accepts the full LauncherConfig shape. Decision: leave as-is for now since validating the entire LauncherConfig is complex and the PRD says "start with highest-duplication groups."
- `src/routes/api/last-used-profile.ts` -- PUT uses ProfileNameBody
- `src/routes/api/projects/[projectSlug]/board/resolve-conflicts.ts` -- POST uses ResolveConflictsBody
- `src/routes/api/open-config-dir.ts` -- POST uses OpenConfigDirBody

### 4E: Launcher-config item routes (itemRoutes helper)

File: `src/server/shared/launcher-config-routes.ts`

Migrate the itemRoutes() and skillReorderRoute() functions to use parseBody() with the defined schemas. This centralizes validation for all 8 launcher-config route files (4 app-level + 4 project-level templates/skills/profiles/shortcuts).

```typescript
// Before
async POST({ params, request }: APIEvent) {
  const body = await request.json();
  ...
}

// After
async POST({ params, request }: APIEvent) {
  const body = await parseBody(request, ItemAddBody);
  ...
}
```

### 4F: Shortcut route

File: `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/shortcut/run.ts`

Use parseBody() with RunShortcutBody.

### Routes to skip (no body parsing)

These routes have no request body validation. They are GET-only, DELETE-with-no-body, or FormData routes:
- `src/routes/api/boards.ts` -- GET handler (keep as-is)
- `src/routes/api/boards/[boardId].ts` -- DELETE handler (no body)
- `src/routes/api/boards/[boardId]/columns/[columnName].ts` -- DELETE handler (no body)
- `src/routes/api/projects/[projectSlug].ts` -- DELETE handler (no body)
- `src/routes/api/projects.ts` -- GET handler (query params)
- `src/routes/api/projects/[projectSlug]/board/pending.ts` -- GET
- `src/routes/api/projects/[projectSlug]/board/sync.ts` -- POST (no body), DELETE (no body)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/archive.ts` -- POST (no body)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/files/upload.ts` -- FormData
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/files/[fileName].ts` -- GET/DELETE (no body)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/context/[name].ts` -- GET/DELETE (no body)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/references/content.ts` -- GET (query params)
- `src/routes/api/projects/[projectSlug]/launcher-config.ts` -- GET handler
- All launcher-config GET routes
- `src/routes/api/pick-directory.ts` -- GET
- `src/routes/api/browse.ts` -- POST (no JSON body, uses query params)
- `src/routes/api/open-config-dir.test.ts` -- test file
- `src/routes/api/launcher-config.ts` -- GET handler
- AI routes: `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/ai/run.ts` and `pull-and-retry.ts` -- these use readLaunchRequest() which already has its own parsing logic with graceful defaults. Leave as-is.

Edge cases in route migration:
- `rename.ts` column route: has conditional validation (`scope === "current"` requires `currentProjectSlug`). The Valibot schema defines all fields, but the conditional check remains in the handler. The schema validates types; business logic stays in the handler.
- `conflict-resolution.ts`: trims and normalizes the prompt. Normalization stays in the handler after schema parse.
- `worktree-root-path.ts`: trims and falls back to undefined. Normalization stays in the handler.
- `column-defaults.ts`: uses spread `{ column, ...patch }`. The schema must capture `column` as a named field and the rest as partial LauncherColumnDefaults.

Acceptance criteria per route:
- No more `await request.json()` followed by manual typeof checks in migrated routes
- All existing e2e tests pass
- Invalid request bodies return 400 with a descriptive error message
- Valid request bodies produce the same behavior as before

## Step 5: Type client-side fetch call sites

Depends on: Step 3

Files modified:
- `src/components/ticket/ticket-detail-state.ts`
- `src/components/ticket/ticket-detail-header.ts`
- `src/components/ticket/ticket-detail-shortcuts.ts`
- `src/components/project/project-page-controller.ts`
- `src/components/launcher/launcher-settings-state.ts`
- `src/components/project/add-project-controller.ts`
- `src/lib/last-used-profile.ts`

Actions:
- Where client code constructs a request body as a plain object and passes it to `JSON.stringify()`, import the corresponding schema's inferred type and annotate the body variable.
- Use `import type { CreateTicketBody }` (not the runtime schema) so valibot stays out of the client bundle.
- Replace `Record<string, unknown>` or untyped inline objects with the shared type.

Examples:

In `ticket-detail-header.ts`:
```typescript
import type { UpdateTicketBody } from "~/server/ticket/ticket-store.js";

const body: UpdateTicketBody = {};
if (trimmedNumber && trimmedNumber !== savedNumber()) body.number = trimmedNumber;
if (trimmedTitle && trimmedTitle !== savedTitle()) body.title = trimmedTitle;
```

In `project-page-controller.ts`:
```typescript
import type { CreateTicketBody, ReorderTicketBody } from "~/server/ticket/ticket-store.js";

// handleCreateTicket
body: JSON.stringify({ number, title } satisfies CreateTicketBody),

// handleReorder
body: JSON.stringify({ folderName, fromColumn, toColumn, newIndex } satisfies ReorderTicketBody),
```

In `ticket-detail-state.ts`:
```typescript
import type { UseWorktreeBody, SaveContextBody, AddReferencesBody, RemoveReferenceBody } from "~/server/ticket/ticket-store.js";
```

In `launcher-settings-state.ts`:
```typescript
import type { CreateBoardBody, ReorderColumnsBody, RenameColumnBody, UpdateColumnBody, AddColumnBody } from "~/server/board/board-types.js";
import type { SetBoardIdBody, SetProjectNameBody } from "~/server/launcher/launcher-config.js";
```

In `last-used-profile.ts`:
```typescript
import type { ProfileNameBody } from "~/server/launcher/launcher-config.js";
```

Use `satisfies` annotations where practical to verify the object shape matches the schema type at compile time without changing runtime behavior.

Acceptance criteria:
- No remaining `Record<string, unknown>` casts for API request bodies
- `tsc --noEmit` catches any mismatch between client body construction and server schema
- Client bundle does not include valibot (only `import type` is used)

## Step 6: Verify

Depends on: Steps 4 and 5

Actions:
1. Run `tsc --noEmit` -- must pass
2. Run `npm run test` (unit tests) -- must pass
3. Run `npm run test:all` -- must pass (includes e2e)

Acceptance criteria:
- All existing tests pass
- No new test files needed (per PRD)
- No runtime regressions

## Edge cases and risks

1. Request body parsing failure (non-JSON body): `request.json()` throws a SyntaxError. The outer wrappers (withService, withProject, withTicketStore) catch all errors and return an error response. SyntaxError is not an AppError, so it returns the default status (400 for withTicketStore, 500 for withService). This matches current behavior. No change needed.

2. ValiError message format: Valibot v1 error messages are human-readable by default (e.g., "Invalid type: Expected string but received number"). The plan uses `e.issues[0]?.message` which gives a single clear message. If the body has multiple invalid fields, only the first is surfaced. This is acceptable; the PRD does not require multi-field error reporting.

3. Optional fields with defaults: Some schemas use `v.optional(v.string())` which allows the field to be undefined. Some use `v.optional(v.array(v.string()), [])` which provides a default. Ensure defaults match current fallback behavior in handlers.

4. The launcher-config PUT route (`src/routes/api/projects/[projectSlug]/launcher-config.ts` and `src/routes/api/launcher-config.ts`): These accept the full LauncherConfig object. Creating a full Valibot schema for LauncherConfig is possible but complex and low-value since these routes are rarely called from custom UIs. Leave as-is or add a simple schema that validates it is an object.

5. The AI launch routes use `readLaunchRequest()` which has intentional graceful defaults (missing fields fall back to defaults). Do not migrate these to strict validation as it would change behavior.

6. `itemRoutes()` in launcher-config-routes.ts: The `pick()` function extracts only configured fields from the body. After migration to parseBody(), the schema replaces pick() since the parsed body already has only the declared fields. The `pick()` function can be removed if schemas fully describe the body shape.

7. Naming: The PRD calls request types "CreateTicketRequest", etc. But the existing code already has `CreateTicketRequest` and `UpdateTicketRequest` interfaces that will be replaced. The plan uses `*Body` suffix (CreateTicketBody, UpdateTicketBody) to distinguish the Valibot schema from the old interfaces during migration. If the team prefers `*Request`, rename accordingly -- but use a consistent suffix.

## Summary of all files to create or modify

New files: none

Modified files:
- `package.json` (add valibot dependency)
- `src/server/shared/route-helpers.ts` (add validated(), parseBody())
- `src/server/ticket/ticket-store.ts` (add schemas, remove old interfaces)
- `src/server/board/board-types.ts` (add schemas)
- `src/server/launcher/launcher-config.ts` (add schemas)
- `src/server/project/project-registry.ts` (add AddProjectBody schema)
- `src/server/shared/launcher-config-routes.ts` (migrate itemRoutes/skillReorderRoute to parseBody())
- `src/routes/api/boards.ts` (POST: parseBody)
- `src/routes/api/boards/[boardId].ts` (PUT: parseBody)
- `src/routes/api/boards/[boardId]/columns.ts` (POST: parseBody)
- `src/routes/api/boards/[boardId]/columns/[columnName].ts` (PUT: parseBody)
- `src/routes/api/boards/[boardId]/columns/[columnName]/rename.ts` (POST: parseBody)
- `src/routes/api/boards/[boardId]/columns/reorder.ts` (PUT: parseBody)
- `src/routes/api/projects.ts` (POST: parseBody)
- `src/routes/api/projects/[projectSlug]/board-id.ts` (PUT: parseBody)
- `src/routes/api/projects/[projectSlug]/name.ts` (PUT: parseBody)
- `src/routes/api/projects/[projectSlug]/worktree-cleanup.ts` (POST: parseBody)
- `src/routes/api/projects/[projectSlug]/board/tickets.ts` (POST: validated)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName].ts` (PUT: validated)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/context/[name].ts` (PUT: validated)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/use-worktree.ts` (PUT: validated)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/references.ts` (POST/DELETE: validated)
- `src/routes/api/projects/[projectSlug]/board/reorder.ts` (POST: validated)
- `src/routes/api/projects/[projectSlug]/board/tickets/[folderName]/shortcut/run.ts` (POST: parseBody)
- `src/routes/api/projects/[projectSlug]/board/resolve-conflicts.ts` (POST: parseBody)
- `src/routes/api/projects/[projectSlug]/launcher-config/column-defaults.ts` (PUT: parseBody)
- `src/routes/api/projects/[projectSlug]/launcher-config/conflict-resolution.ts` (PUT: parseBody)
- `src/routes/api/projects/[projectSlug]/launcher-config/worktree-root-path.ts` (PUT: parseBody)
- `src/routes/api/last-used-profile.ts` (PUT: parseBody)
- `src/routes/api/open-config-dir.ts` (POST: parseBody)
- `src/components/ticket/ticket-detail-state.ts` (type annotations)
- `src/components/ticket/ticket-detail-header.ts` (type annotations)
- `src/components/ticket/ticket-detail-shortcuts.ts` (type annotations)
- `src/components/project/project-page-controller.ts` (type annotations)
- `src/components/launcher/launcher-settings-state.ts` (type annotations)
- `src/components/project/add-project-controller.ts` (type annotations)
- `src/lib/last-used-profile.ts` (type annotations)

## Commit strategy

One commit per logical step or group of related changes:
1. Add valibot dependency + validated()/parseBody() helpers
2. Define all request schemas
3. Migrate route files (can be split by group: tickets, boards, projects, launcher-config)
4. Type client call sites
