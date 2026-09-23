# config/config.json storage plan

Scope: Project Registry and app settings stored in `config/config.json`.

## Client store

Create the store once and provide it through Solid context. Follow the `StoredSignal` pattern in `C:\Users\elkmo\_p\spinloaf-tui`.

```ts
type Result<T, E> =
  | { type: "Success"; value: T }
  | { type: "Failure"; error: E };

interface StoredSignal<T> {
  get: Accessor<T>;
  update(
    transform: (current: T) => T,
  ): Promise<Result<void, string>>;
}

interface AppConfigStorage extends StoredSignal<AppConfigData> {}

const AppConfigContext = createContext<AppConfigStorage>();
```

Consumers access the store through `useContext(AppConfigContext)`. Saving and error UI remain with consumers. Queue client updates so they run sequentially.

## Server interface

```ts
readConfig(
  lock?: boolean,
): Promise<Result<AppConfigData, string>>;

saveConfig(
  config: AppConfigData,
): Promise<Result<AppConfigData, string>>;
```

The server handles file validation, locking, and atomic persistence. The client sends the complete config, never the transform. Use Solid Router queries/actions for server access.

## Data flow

1. Initialize client state with `readConfig()` without a lock.
2. On `update(transform)`, call `readConfig(true)` to acquire the lock and read the latest config.
3. Apply the transform locally.
4. Send the complete modified config to `saveConfig()`.
5. The server validates, saves, releases the lock, and returns the persisted config.
6. Update the client signal with the returned config only after success. On failure, retain the previous signal value and return the error.

## Locking

The lock covers reading, transforming, and saving. There are no separate begin/cancel endpoints or explicit token parameters. Client identity and lock validity are handled internally. Abandoned locks expire.
