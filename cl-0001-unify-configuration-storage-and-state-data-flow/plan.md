# config/launcher-config.json storage plan

Scope: Shared launcher settings, templates, skills, profiles, shortcuts, and column defaults stored in `config/launcher-config.json` under the configured data root.

## Client store

Reuse `StoredSignal`, `createStoredSignal`, and `Result` from the completed app-config implementation. Create the shared launcher store once in `src/app.tsx` and provide it through Solid context.

```ts
const SharedLauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

function createSharedLauncherConfigStorage(): StoredSignal<LauncherConfig>;
```

Consumers access the store through `useContext(SharedLauncherConfigContext)`. Saving and error UI remain with consumers. Queue client updates sequentially through `createStoredSignal`.

Store the raw shared `LauncherConfig`. Scope labels, computed ordering, project overrides, and project metadata belong to the derived view rather than the persisted shared data.

## Server interface

Follow the implemented `readConfig` / `saveConfig` interface, including an owner ID generated internally by the client storage adapter for each update.

```ts
readSharedLauncherConfig(
  owner?: string,
): Promise<Result<LauncherConfig, string>>;

saveSharedLauncherConfig(
  config: LauncherConfig,
  owner: string,
): Promise<Result<LauncherConfig, string>>;
```

The server handles file validation, locking, and atomic persistence. Reuse the existing launcher schema/parser and configuration persistence infrastructure. Validate the full submitted config before writing and return the persisted, normalized config. The client sends the complete shared config, never the transform or a merged project view.

## Data flow

1. Initialize client state with `readSharedLauncherConfig()` without a lock.
2. On `update(transform)`, generate an owner ID and call `readSharedLauncherConfig(owner)` to acquire the shared-file lock and read the latest config.
3. Apply the transform locally.
4. Send the complete modified config to `saveSharedLauncherConfig(config, owner)`.
5. The server validates ownership and config, saves atomically, releases the lock, and returns the persisted config.
6. Update the client signal only after success. On failure, retain the previous signal value and return the error.

## Consumers and merged state

- Route app-scoped add, edit, delete, and reorder operations in `launcher-settings-state.ts` through the shared store. Move their config transformations into client-safe helpers, preserving duplicate-name checks, item order, and existing rename/delete reference updates within the shared file.
- Derive the client merged launcher view reactively from the shared signal and the current project's config, using the existing `mergeLauncherConfigs` behavior. Expose project config separately from the current merged response so overridden shared entries remain available in the shared store.
- Make settings, ticket/project launchers, prompt previews, and shortcut consumers use that reactive merged view. Replace shared-data snapshots and the five-second `latestMergedConfigs` cache as those consumers migrate, so a successful shared edit is reflected immediately.
- Refresh the project input after existing project-scoped saves. Keep project metadata separate from the persisted shared config.
- Server-side launch and shortcut execution continue resolving the latest merged config from storage through `LauncherConfigManager`.

## Column defaults and settings semantics

The shared file's schema supports `columnDefaults`, `worktreeRootPath`, `branchPrefix`, and `conflictResolutionPrompt`. Preserve those fields during full-file updates.

Currently, `mergeLauncherConfigs` takes column defaults, worktree root, and branch prefix only from project config. Only the conflict-resolution prompt falls back to the shared value. Existing column-default saves also write to the project file. Preserve these semantics for this storage migration; adding shared inheritance would require a separate behavior decision.

## Locking

The lock covers reading, transforming, and saving and is keyed to the shared launcher file, independently of `config/config.json`. Validate owner identity and lock expiry on save. Abandoned locks expire, including when a client transform throws or a request is interrupted.

Route every shared-file writer through the same locking/persistence boundary, including any retained `LauncherConfigManager.saveAppConfig` and app-scoped mutation paths, so legacy writes cannot bypass an active update lock.

## Verification

- Concurrent clients cannot overwrite each other's shared edits; invalid or expired owners cannot save.
- Validation or persistence failure leaves the previous file and client signal intact; queued updates continue after failure.
- Shared item edits and ordering propagate to mounted merged-view consumers while project overrides retain precedence.
- Rename/delete reference handling and current column-default/settings semantics remain covered by launcher-config tests.
