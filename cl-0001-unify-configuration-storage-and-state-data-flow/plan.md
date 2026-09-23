# config/launcher-config.json storage plan

Scope: Shared launcher settings, templates, skills, profiles, shortcuts, and column defaults stored in `config/launcher-config.json` under the configured data root.

## Client store

Follow commit `639d391` (`Unify app configuration storage and client state`). Reuse `StoredSignal`, `createStoredSignal`, `Updater`, and `Result` rather than introducing launcher-specific versions. Create the shared launcher store once inside the `AppRouter` child in `src/app.tsx` and provide it through Solid context under the existing `Errored` / `Loading` boundaries.

```ts
const SharedLauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

function createSharedLauncherConfigStorage(): StoredSignal<LauncherConfig> {
  const initial = createMemo(async () => {
    const result = await readSharedLauncherConfig();
    if (result.type === 'Failure') throw new Error(result.error);
    return result.value;
  });
  return createStoredSignal(initial, async transform => {
    const owner = crypto.randomUUID();
    const current = await readSharedLauncherConfig(owner);
    if (current.type === 'Failure') return current;
    return saveSharedLauncherConfig(transform(current.value), owner);
  });
```

Consumers access the store through `useContext(SharedLauncherConfigContext)`. Saving and error UI remain with consumers. Queue client updates sequentially through `createStoredSignal`.

The existing utility already catches transform/persistence exceptions, returns `Failure`, retains the previous signal on failure, and keeps the queue usable. Initialization uses Solid's async memo and the existing loading/error boundaries; it needs no separate resource, loading/error store, or custom context hook.

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

Use plain async functions with `'use server'`, as in `config-api.ts`, rather than Router query/action wrappers. Each function catches server exceptions and converts them with `fail(errorMessage(error))`; successful calls use `succeed`. The save endpoint requires a nonempty owner. The client sends the complete shared config, never the transform or a merged project view.

## Server storage

- Extract launcher data types, decoding, and pure merging into a client-safe data module, following `app-config-data.ts`. Keep filesystem dependencies in the server storage/manager layer.
- Add a small `SharedLauncherConfigStore`, following `AppConfigStore`, with synchronous `read(owner?)` and `write(config, owner?)` methods. Compose the existing `ConfigPaths`, `ConfigRepository`, and `UpdateLock` directly.
- Read and decode the file inside `lock.read`. Decode the submitted config and call `ConfigRepository.writeJson` inside `lock.write`, returning the normalized config. Reuse the repository's atomic-write implementation.
- Preserve extra JSON fields through decoding and spread-based updates using loose schemas, following the last commit's removal of separate extra-field bookkeeping.
- Create one store in `service-container.ts`, export it through `instances.ts`, and inject that same instance into `LauncherConfigManager`. Replace the manager's shared-file read/write implementation with delegation to this store.

## Data flow

1. Initialize client state with `readSharedLauncherConfig()` without a lock.
2. On `update(transform)`, generate an owner ID and call `readSharedLauncherConfig(owner)` to acquire the shared-file lock and read the latest config.
3. Apply the transform locally.
4. Send the complete modified config to `saveSharedLauncherConfig(config, owner)`.
5. The server validates ownership and config, saves atomically, releases the lock, and returns the persisted config.
6. Update the client signal only after success. On failure, retain the previous signal value and return the error.

## Consumers and merged state

- Route app-scoped add, edit, delete, and reorder operations in `launcher-settings-state.ts` through direct `sharedConfig.update(current => ...)` transforms. Extract pure helpers only where transformations are reused or sufficiently complex. Preserve duplicate-name checks, item order, and existing rename/delete reference updates within the shared file.
- Remove the superseded app-scoped API branches and unused manager mutation methods, following the removal of field-specific config endpoints in the last commit. Retain the paths still needed by project-scoped or server-side operations.
- Derive the client merged launcher view reactively from the shared signal and the current project's config, using the existing `mergeLauncherConfigs` behavior. Expose project config separately from the current merged response so overridden shared entries remain available in the shared store.
- Make settings, ticket/project launchers, prompt previews, and shortcut consumers use that reactive merged view. Replace shared-data snapshots and the five-second `latestMergedConfigs` cache as those consumers migrate, so a successful shared edit is reflected immediately.
- Refresh the project input after existing project-scoped saves. Keep project metadata separate from the persisted shared config.
- Server-side launch and shortcut execution continue resolving the latest merged config from storage through `LauncherConfigManager`.

## Column defaults and settings semantics

The shared file's schema supports `columnDefaults`, `worktreeRootPath`, `branchPrefix`, and `conflictResolutionPrompt`. Preserve those fields during full-file updates.

Currently, `mergeLauncherConfigs` takes column defaults, worktree root, and branch prefix only from project config. Only the conflict-resolution prompt falls back to the shared value. Existing column-default saves also write to the project file. Preserve these semantics for this storage migration; adding shared inheritance would require a separate behavior decision.

## Locking

Reuse one `UpdateLock` instance owned by the shared-file store, independently of `config/config.json`. Its existing in-memory lease covers reading, transforming, and saving:

- Reads without an owner remain available during a lease.
- A read with an owner fails immediately if another lease is active; there is no server-side wait/retry queue.
- Saves with an owner require the matching, unexpired lease. Server-internal writes may omit the owner only when no lease is active.
- A validated owner's write releases the lease in `finally`, including validation or persistence failures. A rejected owner cannot release another owner's lease.
- Abandoned leases expire after the existing 30-second timeout, including when a client transform throws or a request is interrupted.

Use this utility as-is; no begin/cancel endpoints, heartbeat, lock registry, filesystem lock, or additional lock protocol is needed.

Route every shared-file writer through the same locking/persistence boundary, including any retained `LauncherConfigManager.saveAppConfig` and app-scoped mutation paths, so legacy writes cannot bypass an active update lock.

## Verification

- Concurrent clients cannot overwrite each other's shared edits; invalid or expired owners cannot save.
- Validation or persistence failure leaves the previous file and client signal intact; queued updates continue after failure.
- Shared item edits and ordering propagate to mounted merged-view consumers while project overrides retain precedence.
- Rename/delete reference handling and current column-default/settings semantics remain covered by launcher-config tests.
- Reuse the existing stored-signal tests for queueing and signal publication; add launcher-specific integration coverage rather than duplicating utility tests.
