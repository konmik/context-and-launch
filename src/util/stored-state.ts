import { createMemo, createSignal, type Accessor } from 'solid-js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from './user-facing-error.js'
import { failure, success, type Result } from './result.js'

export interface StoredState<T> {
  get: Accessor<T>
  enqueueAndPublish(operation: () => Promise<Result<T, UserFacingError>>): Promise<Result<void, UserFacingError>>
}

export interface StoredStateOptions<T> {
  initialValue: T
}

interface StoredRead<T> {
  value: T | Promise<T>
}

export function createStoredState<T>(read: () => T | Promise<T>, options?: StoredStateOptions<T>): StoredState<T> {
  const source = createMemo<StoredRead<T>>(() => ({ value: read() }))
  const initial = createMemo(
    () => source().value,
    options && {
      loadingValue: options.initialValue,
    },
  )
  const [saved, setSaved] = createSignal<{
    value: T
    source: StoredRead<T>
  }>()
  let pending = Promise.resolve()

  function enqueueAndPublish(operation: () => Promise<Result<T, UserFacingError>>): Promise<Result<void, UserFacingError>> {
    const completion = pending.then(async (): Promise<Result<void, UserFacingError>> => {
      try {
        const currentSource = source()
        const next = await operation()
        if (next.type === 'Failure') return next
        setSaved({
          value: next.value,
          source: currentSource,
        })
        return success(undefined)
      } catch (error) {
        return failure(errorPayload(error, 'Operation failed'))
      }
    })
    pending = completion.then(() => {})
    return completion
  }

  return {
    get: () => {
      const currentSource = source()
      const currentSaved = saved()
      return currentSaved?.source === currentSource ? currentSaved.value : initial()
    },
    enqueueAndPublish,
  }
}
