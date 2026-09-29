// Tracks long-running git operations (sync, abort, conflict resolution) for Electron graceful shutdown.
export interface OperationTracker {
  track<T>(operation: Promise<T>): Promise<T>
  hasPending(): boolean
  waitForAll(): Promise<void>
}

export function createOperationTracker(): OperationTracker {
  const pending = new Set<Promise<unknown>>()

  function track<T>(operation: Promise<T>): Promise<T> {
    pending.add(operation)
    const cleanup = () => {
      pending.delete(operation)
    }
    operation.then(cleanup, cleanup)
    return operation
  }

  function hasPending(): boolean {
    return pending.size > 0
  }

  async function waitForAll(): Promise<void> {
    while (pending.size > 0) {
      await Promise.allSettled(pending)
    }
  }

  return {
    track,
    hasPending,
    waitForAll,
  }
}
