# Unify configuration storage and state data flow

Refactor configuration persistence and state management into a consistent architecture across global, project, and ticket scopes.

## Scope

- Global files: config.json, launcher-config.json, boards.json, and command-templates.json.
- Project files: launcher-config.json, diff-review.json, ticket-order.json, and forest-layout.json.
- Ticket files: status.json and the ticket-scoped state currently stored in project files.
- Related persisted state: agent runtime markers, Electron window-state.json, and UI preferences in localStorage.
- Bundled defaults and their relationship to persisted overrides.

## Goals

- Inventory current storage locations, schemas, ownership, readers, writers, and state synchronization paths.
- Define shared storage contracts for path resolution, parsing, validation, defaults, reads, writes, and error reporting.
- Make global, project, and ticket scope explicit, including inheritance and override rules.
- Establish a consistent data flow from persistent storage through server queries and actions to UI state, including mutation invalidation and external file changes.
- Remove duplicate persistence and synchronization logic while preserving appropriate differences between configuration, durable state, and runtime state.
- Preserve existing settings and ticket data; provide explicit migrations wherever formats or locations change.

## Acceptance criteria

- Configuration and persisted state use documented, consistent storage and data-flow patterns.
- Each setting or state value has a clear authoritative owner and persistence location.
- Global and project launcher merging and defaults retain their intended behavior.
- Successful mutations and external changes update affected consumers consistently without stale or competing state.
- Persistence and validation failures reach the user rather than silently losing data or replacing invalid values.
- Existing user data remains readable or is migrated without loss.
- Meaningful tests cover scope resolution, persistence, migrations where needed, and state propagation.
- Documentation describes the resulting storage layout and data flow.
