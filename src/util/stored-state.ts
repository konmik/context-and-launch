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

export function createStoredState<T>(read: () => T | Promise<T>, options?: StoredStateOptions<T>): StoredState<T> {
  const initial = createMemo(
    read,
    options && {
      loadingValue: options.initialValue,
    },
  )
  const [saved, setSaved] = createSignal<{
    value: T
  }>()
  let pending = Promise.resolve()

  function enqueueAndPublish(operation: () => Promise<Result<T, UserFacingError>>): Promise<Result<void, UserFacingError>> {
    const completion = pending.then(async (): Promise<Result<void, UserFacingError>> => {
      try {
        const next = await operation()
        if (next.type === 'Failure') return next
        setSaved({
          value: next.value,
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
    get: () => saved()?.value ?? initial(),
    enqueueAndPublish,
  }
}
