# Plugin System and Deep Modules

## Problem Statement

Context & Launch composes its features statically across page components, controllers, server functions, and core services. A feature cannot be enabled or disabled for one Project without editing application code, and feature behavior leaks across the current `core` and `components` directories through direct implementation imports. Ticket Sync demonstrates the problem: its toolbar controls, polling, Git orchestration, conflict handling, launcher integration, and settings are spread across unrelated modules and wired directly into the Project Page.

This structure makes optional features difficult to isolate, test, replace, or remove. It also leaves each feature with a large accidental API instead of one explicit interface.

## Solution

Adopt Cordis directly as the compiled built-in Plugin runtime, following the checked-out DeepSeek Harness architecture. Use Cordis contexts, services, fibers, injection, effects, isolation, lifecycle, and disposal rather than application-owned equivalents. Users manage Plugins in Settings with User-scope defaults and Project-scope overrides. Each Project receives its own effective Plugin composition, so one Project can disable a Plugin without affecting another.

Make Ticket Sync the first built-in Plugin. The Ticket Sync Plugin owns the complete remote synchronization capability while the Worktree host continues providing automatic local ticket commits. Move all feature modules directly under `src`, remove the architectural split between `core` and `components`, and expose each feature through one enforced public entry point.

## Requirements

1. Settings lists every built-in Plugin and its description, effective enablement, configured scope, runtime state, dependencies, configuration, and latest failure -- because users need one authoritative place to understand available behavior.
2. A Plugin has a User-scope enablement default and a Project-scope `inherit`, `enabled`, or `disabled` override -- because users need shared defaults without losing per-Project control.
3. Ticket Sync is enabled by default for existing and newly registered Projects -- because introducing the Plugin system must not silently remove current behavior.
4. Saving Plugin enablement applies to every open Project Window for that Project without an application restart -- because Project-scoped configuration must behave consistently wherever the Project is visible.
5. Disabling a Plugin removes its UI contributions, stops its background work, rejects new Plugin operations, and releases its resources -- because disabled behavior must be genuinely inactive rather than merely hidden.
6. Enabling a Plugin activates its contributions without duplicating registrations left by an earlier activation -- because repeated enable and disable cycles must remain deterministic.
7. Disabling one Project's Plugin does not change any other Project's effective composition -- because Plugin enablement is Project-scoped.
8. An active Ticket Sync finishes before a requested disable takes effect, and Settings shows that disablement is pending -- because interrupting Git during synchronization can damage the Worktree state.
9. Ticket Sync cannot be disabled while its Project has an unresolved Sync conflict, and Settings directs the user to resolve or abort it -- because hiding the only recovery controls would strand the Worktree.
10. The Ticket Sync Plugin owns the Sync toolbar controls, Sync Pending indicator, status polling, remote Git synchronization, conflict detection, Conflict Dialog, Conflict Resolution launch, and Sync abort behavior -- because one user capability should have one cohesive owner.
11. Disabling Ticket Sync leaves automatic local ticket commits active -- because local Worktree durability is foundational ticket storage behavior rather than remote synchronization.
12. Enabled Ticket Sync preserves the current observable Sync, Sync Pending, conflict detection, Conflict Resolution, and abort behavior -- because converting a feature into a Plugin is not a redesign of that feature.
13. Ticket Sync's Conflict Resolution prompt is configurable at User and Project scopes within the Plugin's Settings panel -- because configuration should be owned by the feature that consumes it.
14. Existing User- and Project-scoped Conflict Resolution prompts migrate without data loss -- because persisted user configuration is a shipped compatibility obligation.
15. A failed optional Plugin does not prevent the Project from opening or other Plugins from activating -- because one optional capability must not take down the application.
16. A failed Plugin leaves no partial UI, polling, event, service, or resource registrations -- because partial activation creates behavior that Settings cannot accurately represent or disable.
17. Settings shows a failed Plugin's lifecycle stage and actionable error while retaining its saved enablement and configuration -- because failure is different from user disablement and must be diagnosable.
18. A Plugin with an unavailable required host interface or required Plugin remains enabled but blocked and identifies every missing dependency -- because the host must not silently rewrite the user's choices.
19. A blocked Plugin activates automatically when all required dependencies become available -- because dependency recovery should not require toggling or restarting.
20. Invalid Plugin configuration is rejected before it is persisted -- because Settings must not knowingly replace working configuration with unusable state.
21. A valid live configuration update that fails activation leaves the last-good Plugin instance and configuration active -- because reconfiguration must not unnecessarily remove working behavior.
22. Application shutdown waits for Plugin cleanup through the existing graceful-shutdown lifecycle -- because Plugin-owned work and resources require the same safety guarantees as watchers and tracked Git operations.
23. Every application feature lives in a feature-named top-level module under `src`, with no `core` versus `components` directory split -- because source organization should follow behavior rather than code type.
24. Optional Plugin modules use the `plugin-*` name prefix, beginning with `plugin-ticket-sync` -- because optional composition must be visible in the source architecture.
25. Every feature module exposes one explicit public API and hides all other implementation files from other features -- because a deep module is valuable only when its internal complexity does not become a repository-wide dependency.
26. Cross-feature imports that bypass a feature's public API fail linting in source and tests -- because public boundaries must be continuously enforced rather than documented as a convention.
27. Privileged Plugin behavior remains behind server functions while renderer contributions remain client-only -- because the existing Electron security and client-only rendering boundaries are load-bearing.
28. Plugin definitions are loaded only from the application's explicit compiled registry -- because this release is an architecture and built-in composition system, not a third-party code distribution system.

## Implementation Decisions

- The Plugin runtime is `@deepseek-ai/cordis@4.0.1`, the runtime version in the checked-out DeepSeek Harness reference. Context & Launch imports and uses Cordis directly; it does not reproduce `Context`, `Fiber`, `Service`, injection, effects, isolation, lifecycle, or disposal behind application-owned equivalents.
- The application retains a small compiled catalog containing stable persistence IDs, display metadata, default enablement, configuration schemas, Cordis host plugins, and separate Cordis renderer plugins where needed. The catalog is policy and metadata, not a second plugin runtime.
- Stable Plugin IDs are configuration keys and dependency targets. A duplicate ID or unsupported Plugin API version is a definition error and must be reported before Project composition.
- Built-in Plugin definitions are explicitly imported into one ordered registry. Registry order provides deterministic contribution order and is not user-configurable in this release.
- The server owns one root Cordis `Context`. Each open Project owns a child Project fiber/context, and enabled Plugin fibers are mounted below it. Project-provided service names are isolated so one Project cannot satisfy another Project's service lookup.
- The host maintains one authoritative Project Plugin state shared by all Project Windows. Renderers observe that state rather than maintaining independent enablement caches.
- Saved state and runtime state are separate. Saved enablement is `inherit`, `enabled`, or `disabled`; runtime state distinguishes disabled, loading, active, blocked, failed, updating, and pending disable.
- User Plugin configuration is stored in the application config area and Project overrides are stored in the Project's local config area. Both are keyed by stable Plugin ID and keep enablement separate from Plugin-owned configuration.
- Project configuration inherits the User enablement and Plugin configuration unless it explicitly overrides a value. Ticket Sync's Conflict Resolution prompt retains its current User-then-Project precedence.
- Plugin configuration uses runtime schema validation through the project's existing validation approach. Configuration writes retain the existing atomic write guarantees.
- The Conflict Resolution prompt migration is idempotent at both scopes. An already-present Ticket Sync Plugin value wins; otherwise the legacy Launcher Config value is copied, verified as persisted, and only then removed from its legacy location.
- Privileged host capabilities are narrow named services provided on the root Cordis context. Plugins declare them through Cordis `inject`; a missing required service leaves the real Plugin fiber pending and dependency recovery is handled by Cordis.
- Each Project Window owns an independent renderer Cordis root. Renderer contribution registries are Cordis services, and contribution/timer cleanup is owned by the calling renderer Plugin fiber through `ctx.effect()`.
- Extension points are added only for an implemented Plugin use case. There is no generic route injection, arbitrary component mutation, global event bus, or service replacement API.
- Every registration is owned by its Cordis fiber. Plugins use `ctx.effect()`, `ctx.on()`, `ctx.provide()`, or `Service`; failed activation and normal disposal are unwound by Cordis.
- Cordis owns activation and update teardown. The application coordinator preserves the product's last-good update requirement by explicitly restoring the previous validated config when `Fiber.update()` rejects; it does not recreate candidate registration staging.
- Runtime dependencies use injected service names. A Plugin-to-Plugin dependency injects the service provided by the dependency Plugin rather than checking a parallel Plugin ID state map.
- Optional Plugin failures are contained at the Plugin boundary. Foundational application startup failures remain fatal and are not relabeled as Plugin failures.
- Renderer hook failures are isolated when the hook is observational. Failures in an operation-authorizing or mutation hook abort that operation and are surfaced according to the hook contract.
- Renderer activation remains separate from privileged host activation. Renderer code cannot import Node APIs or acquire broader Electron preload authority through the Plugin system.
- Server functions owned by a Plugin verify that the Plugin is effectively active for the requested Project. Hiding renderer controls alone is not treated as enforcement.
- The Ticket Sync Plugin depends on narrow host interfaces for Project lookup, Worktree access, Git/Command Template execution, Launcher access, logging, file-watcher coordination, and operation tracking.
- The Ticket Sync Plugin owns Sync-specific state and APIs, including pending-state caching and invalidation, serialized status work, conflict state, and the complete Sync UI/controller flow.
- Worktree change observation and automatic local commits remain in the Worktree host module. They continue invalidating any Ticket Sync state through an explicit public interface when the Plugin is active.
- During an active Sync, a saved disable request enters pending-disable state and completes disposal after the tracked operation settles. During an unresolved conflict, Settings rejects the disable request without changing the saved effective state.
- Feature modules are moved directly beneath `src` and combine their current domain logic, UI, server functions, controllers, and tests. Internal organization may use subfolders when useful, but may not recreate repository-wide folders by code type.
- Existing broad `shared`, `lib`, or `infra` code is assigned to the feature that owns it or extracted as a narrowly named capability module. A generic dumping-ground module is not a public escape hatch around feature boundaries.
- Each feature's `index.ts` is its sole public entry point. Code inside a feature uses relative imports; code outside imports the feature entry point through the project alias.
- `eslint-plugin-boundaries` enforces allowed entry-point imports and prevents deep imports across feature modules. The repository remains a single package; it is not converted into a monorepo solely to gain `package.json` export enforcement.
- Tests colocated inside a feature may exercise that feature's internals with relative imports. Tests outside the feature and all production consumers must use its public entry point.
- The application composition root depends only on feature public APIs and provides implementations of the narrow Cordis services injected by Plugins.
- Existing Sync behavioral specs remain authoritative. This PRD changes ownership, composition, and configurability without weakening those behaviors.

## Testing Decisions

- The primary test seam is a Project's effective Plugin composition observed through the real Settings UI, Project Page, server functions, and Git-backed Worktree. This is the highest seam that proves enablement, UI contribution, operation gating, and Project isolation together.
- End-to-end tests use the existing Playwright fixtures and real sandboxed Git repositories. They enable and disable Ticket Sync through Settings and verify controls, polling-visible state, real Sync outcomes, conflict recovery, and persistence across reloads without stubbing server functions.
- A multi-Project end-to-end scenario proves that disabling Ticket Sync for one Project does not affect another open Project and that every window for the same Project receives the change.
- End-to-end coverage proves Ticket Sync remains enabled by default and retains existing successful Sync, pending indicator, conflict, abort, and Conflict Resolution behavior after conversion.
- End-to-end coverage proves a disabled Ticket Sync rejects direct server-operation attempts as well as hiding UI, while automatic local ticket commits continue.
- Integration tests mount small test Plugins through real Cordis `Context`, `Fiber`, `Service`, `inject`, and effect APIs. They inspect live fibers/services/effects in addition to public snapshots, covering activation, exact cleanup, repeated enable/disable, dependency loss/recovery, Project isolation, shutdown, and deterministic catalog ordering.
- Integration tests inject failures at resolution, configuration validation, activation, live update, and disposal seams. They assert authoritative runtime state, useful diagnostics, no leaked registrations, and preservation of the last-good instance.
- Configuration tests cover User default and Project override resolution, atomic persistence, invalid input rejection, and idempotent migration of Conflict Resolution prompts at both scopes.
- Existing Ticket Sync and conflict-resolution test matrices remain at their current service-level seam after moving into the Plugin module. Their assertions should change only where the new public Plugin boundary requires it.
- Existing Sync Pending tests remain focused on cache computation and invalidation, while Project-level behavior is covered at the primary end-to-end seam.
- Renderer tests verify contribution mounting and disposal without testing internal component structure.
- Architecture tests and ESLint fixtures prove that cross-feature deep imports fail, public entry-point imports pass, and the rule applies equally to production code and cross-feature tests.
- The standard workspace typecheck, lint, unit, build, and end-to-end gates must pass after the source-tree migration.

## Out of Scope

- Loading Plugins from arbitrary filesystem paths, local packages, `node_modules`, npm, Git, or remote registries.
- A Plugin marketplace, package installation, update management, provenance UI, signing, permissions, or sandboxing of third-party code.
- Filesystem scanning or convention-based Plugin discovery.
- User-authored or dynamically evaluated Plugin code.
- Hot module replacement for Plugin source code; only Settings-driven enablement and configuration updates are live.
- User-configurable Plugin order.
- Arbitrary route injection, service replacement, monkey-patching, or a general-purpose event framework.
- Converting every optional product feature into a Plugin in this ticket; Ticket Sync is the first conversion.
- Changing Ticket Sync's Git algorithm, polling semantics, conflict policy, or user workflow beyond what Plugin ownership and Settings require.
- Converting the repository into a monorepo or separate npm packages.

## Further Notes

- DeepSeek Harness is the architectural reference. Context & Launch uses Cordis itself for runtime semantics and implements only application policy around it: compiled catalog metadata, persisted User/Project settings, operation drain and veto, serializable projections, and host/renderer transport.
- The architecture should make another built-in feature convertible without changing the Plugin lifecycle contract, but no speculative contribution API should be added until that feature creates a concrete need.
- "Plugin" refers to executable application behavior. Skills remain prompt text and are not Plugins.
