# Detailed Implementation Plan: Direct Cordis Plugin System

## Goal And Authority

Use Cordis directly, matching `C:\third-party\deepseek-harness`. The previous plan for an application-owned approximation is superseded. Context & Launch must not retain local equivalents of Cordis `Context`, `Fiber`, `Service`, injection, effects, isolation, lifecycle, or disposal.

The behavioral requirements in `product-requirement-document.md`, `spec/ticket-sync.md`, and `spec/sync-pending-indicator.md` remain authoritative. Ticket Sync behavior, scoped persistence, conflict veto, pending disable, multi-window propagation, and automatic local ticket commits must be preserved.

## Runtime Boundary

Cordis owns:

- Plugin entrypoint execution and configuration validation.
- Fiber state and parent/child lifecycle ownership.
- Required-service injection and dependency loss/recovery.
- Named service publication and lookup.
- Effect, event-listener, timer, and registration cleanup.
- Service isolation and complete async disposal.

Context & Launch owns:

- The compiled built-in Plugin catalog and stable persisted Plugin IDs.
- User/Project enablement and configuration documents.
- Effective configuration resolution and write transactions.
- Operation gating, pending-disable draining, and conflict veto policy.
- Serializable Settings projections and revision invalidation.
- The privileged host versus renderer process boundary.

No application coordinator may become a second lifecycle authority. It may choose which Cordis fibers to mount or dispose, but it must not own a parallel activation instance map, dependency reconciler, registration owner, or cleanup stack.

## Dependency

Use the checked-out Harness runtime version:

```json
"@deepseek-ai/cordis": "4.0.1"
```

The installed closure must contain one copy each of `@deepseek-ai/cordis@4.0.1`, `@deepseek-ai/cosmokit@1.8.2`, and `@standard-schema/spec@1.1.0`.

Do not add Cordis Loader for this ticket. Harness needs Loader for YAML composition, dynamic module loading, groups, and HMR. Context & Launch uses an explicit compiled catalog and already owns scoped persistence. Add Loader only if those requirements are introduced later.

## Context Topology

### Server

1. Create one root Cordis `Context` in application composition.
2. Provide narrow application-owned Ticket Sync adapters on the root with `ctx.provide()`.
3. For each open Project, mount one Project owner fiber and derive a context carrying `projectSlug` metadata.
4. Isolate each Project-provided Plugin service name, including `ticketSync`.
5. Mount enabled catalog host Plugins below the Project owner context.
6. Close a Project by rejecting/draining its operations and awaiting the Project owner fiber's disposal.
7. Shut down by closing every Project and then awaiting root-fiber disposal.

### Renderer

1. Create one independent renderer Cordis root per Project page/window.
2. Provide a renderer contribution `Service` containing ordered toolbar, dialog, background, and Settings registries.
3. Mount each catalog Settings Plugin regardless of host enablement.
4. Mount active renderer Plugins only while the host snapshot is active or has an explicit last-good active runtime.
5. Register contributions and polling through caller-owned Cordis effects.
6. Dispose the renderer root when its page/window scope is destroyed.

Host contexts, fibers, services, and Plugin objects never cross the server/renderer boundary. Renderers receive serializable snapshots and invoke server functions only.

## Ticket Sync Mapping

- `TicketSyncService` is a Cordis `Service` class Plugin providing `ticketSync`.
- It declares `ticketSyncWorktree`, `ticketSyncCommand`, `ticketSyncGit`, `ticketSyncLauncher`, and `ticketSyncOperations` through `static inject`.
- Its Valibot configuration schema is also its Standard Schema-compatible Cordis `Config`.
- Finalizing an interrupted resolution happens in `Service.init`.
- Its Worktree subscription is a labeled `ctx.effect()`.
- `sync`, `resolve`, and `abort` remain operation-tracked exactly as before.
- `assertCanDisable()` remains application policy invoked before fiber disposal.
- Server functions resolve the live Project `ticketSync` service and reject disabled, pending, blocked, or failed-without-last-good access.
- Renderer Settings and active UI are separate Cordis Plugins so Settings remains available while toolbar/dialog/polling resources are absent.

## Persistence And Updates

Keep the existing JSON format and verified legacy prompt migration.

For a Project update:

1. Resolve and validate the proposed complete effective configuration.
2. If disabling, reject new operations, publish pending-disable, await existing work, and run the disable guard.
3. Apply the runtime transition with Cordis.
4. Persist only after the runtime transition succeeds.
5. If persistence or activation fails, restore the previous runtime config/state and leave the old document intact.
6. Publish invalidation only after commit.

For a User update, preflight every open Project first, apply every Project under one mutation transaction, and roll back already-applied Projects in reverse order if any Project or the durable write fails.

`Fiber.update()` unloads before applying the candidate. To preserve the required last-good behavior, explicitly call `fiber.update(previousConfig, true)` after a rejected candidate. Do not recreate blue-green registration staging around Cordis.

## Files To Remove

Delete the bespoke lifecycle implementation after callers migrate:

- `src/plugin-system/internal/plugin-host.ts`
- `src/plugin-system/internal/project-plugin-host.ts`
- `src/plugin-system/internal/renderer-host.ts`
- `src/plugin-system/internal/registration-owner.ts`

Remove the associated `HostPluginFace`, `RendererPluginFace`, activation-context, host-interface-ID, and registration-owner contracts. Retain metadata/config/snapshot DTOs, ordered registry storage, invalidation transport, and legacy migration behavior.

## Implementation Sequence

1. Install exact Cordis and verify one dependency copy.
2. Replace shared contracts with catalog metadata referencing Cordis Plugins.
3. Convert Ticket Sync host activation into an injected Cordis `Service` Plugin.
4. Add the root context, Project owner contexts/fibers, and thin Project runtime coordinator.
5. Move application host adapters from custom interface registration to `ctx.provide()`.
6. Route server service lookup, Project open/close, and shutdown through the Cordis runtime.
7. Add the renderer contribution `Service` and renderer runtime.
8. Split Ticket Sync Settings and active renderer contributions into separate Cordis Plugins.
9. Remove every bespoke lifecycle class and stale export.
10. Replace bespoke-host tests with real Cordis integration tests.
11. Run typecheck, lint, focused unit tests, build, and bounded Ticket Sync E2E suites.

## Verification

Tests must prove Cordis facts, not only application snapshots:

- A required injected service leaves the real fiber pending.
- Providing/removing/reproviding it activates, unloads, and reloads effects through Cordis.
- `ctx.get()` exposes the service only while its provider fiber is active.
- Project A and Project B have distinct isolated service instances and owner fibers.
- Disposing Project A does not affect Project B.
- Failed activation unwinds every registered Cordis effect.
- Candidate update failure restores the previous active config and service.
- Disable waits for operations and conflict veto leaves disk and fiber active.
- Renderer settings survive host disable while toolbar/dialog/polling effects disappear.
- Two windows have independent renderer roots but converge on one server Project snapshot.
- Root shutdown awaits Project and effect disposal exactly once.
- Built output contains no host-only Node/Git implementation in the renderer graph.

Required gates:

```text
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e
```

Run E2E commands in targeted, bounded suites to avoid hanging the shared test environment.
