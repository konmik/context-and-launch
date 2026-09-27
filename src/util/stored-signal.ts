import type { Accessor } from 'solid-js'
import { success, type Result } from './result.js'
import type { Updater } from './updater.js'
import type { UserFacingError } from './user-facing-error.js'
import { createStoredState, type StoredStateOptions } from './stored-state.js'

export interface StoredSignal<T> {
  get: Accessor<T>
  update(transform: Updater<T>): Promise<Result<void, UserFacingError>>
  refresh(): Promise<Result<void, UserFacingError>>
}

export function createStoredSignal<T>(
  read: () => T | Promise<T>,
  persist: (transform: Updater<T>) => Promise<Result<T, UserFacingError>>,
  options?: StoredStateOptions<T>,
): StoredSignal<T> {
  const state = createStoredState(read, options)
  return {
    get: state.get,
    update: (transform) => state.enqueueAndPublish(() => persist(transform)),
    refresh: () => state.enqueueAndPublish(async () => success(await read())),
  }
}
