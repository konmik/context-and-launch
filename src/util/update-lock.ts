interface Lease {
  owner: string
  expiresAt: number
}

export interface UpdateLock {
  read<T>(read: () => T, owner?: string): T
  write<T>(write: () => T, owner?: string): T
  release(owner: string): void
  writeWhenAvailable<T>(write: () => T): Promise<T>
}

export function createUpdateLock(leaseMs: number = 30000, now: () => number = Date.now): UpdateLock {
  let leaseValue: Lease | undefined

  function activeLease(): Lease | undefined {
    if (leaseValue && leaseValue.expiresAt <= now()) leaseValue = undefined
    return leaseValue
  }

  function read<T>(read: () => T, owner?: string): T {
    if (owner && activeLease()) throw new Error('File is being updated in another request. Try again.')
    const value = read()
    if (owner)
      leaseValue = {
        owner,
        expiresAt: now() + leaseMs,
      }
    return value
  }

  function write<T>(write: () => T, owner?: string): T {
    const lease = activeLease()
    if (owner && lease?.owner !== owner) throw new Error('File update lock is missing or expired. Try again.')
    if (!owner && lease) throw new Error('File is being updated in another request. Try again.')
    try {
      return write()
    } finally {
      leaseValue = undefined
    }
  }

  function release(owner: string): void {
    if (activeLease()?.owner === owner) leaseValue = undefined
  }

  async function writeWhenAvailable<T>(update: () => T): Promise<T> {
    // Yield while a client owns the lease; the callback itself must write synchronously.
    while (activeLease()) await new Promise((resolve) => setTimeout(resolve, 10))
    return write(update)
  }

  return {
    read,
    write,
    release,
    writeWhenAvailable,
  }
}
