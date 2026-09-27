import { describe, it, expect } from 'vitest'
import { createOperationTracker } from '../../../src/core/infra/operation-tracker.js'

describe('OperationTracker', () => {
  it('reports no pending when empty', () => {
    const tracker = createOperationTracker()
    expect(tracker.hasPending()).toBe(false)
  })
  it('tracks a pending operation', async () => {
    const tracker = createOperationTracker()
    let resolve!: () => void
    const p = new Promise<void>((r) => {
      resolve = r
    })
    tracker.track(p)
    expect(tracker.hasPending()).toBe(true)
    resolve()
    await tracker.waitForAll()
    expect(tracker.hasPending()).toBe(false)
  })
  it('removes operation on rejection', async () => {
    const tracker = createOperationTracker()
    let reject!: (err: Error) => void
    const p = new Promise<void>((_, r) => {
      reject = r
    })
    const tracked = tracker.track(p)
    expect(tracker.hasPending()).toBe(true)
    reject(new Error('fail'))
    await tracked.catch(() => {})
    await tracker.waitForAll()
    expect(tracker.hasPending()).toBe(false)
  })
  it('waitForAll resolves immediately when no operations', async () => {
    const tracker = createOperationTracker()
    await tracker.waitForAll()
  })
  it('waitForAll waits for multiple operations', async () => {
    const tracker = createOperationTracker()
    let resolve1!: () => void
    let resolve2!: () => void
    const p1 = new Promise<void>((r) => {
      resolve1 = r
    })
    const p2 = new Promise<void>((r) => {
      resolve2 = r
    })
    tracker.track(p1)
    tracker.track(p2)
    expect(tracker.hasPending()).toBe(true)
    resolve1()
    await p1
    expect(tracker.hasPending()).toBe(true)
    resolve2()
    await tracker.waitForAll()
    expect(tracker.hasPending()).toBe(false)
  })
  it('returns the original promise value', async () => {
    const tracker = createOperationTracker()
    const result = await tracker.track(Promise.resolve(42))
    expect(result).toBe(42)
  })
  it('propagates rejection', async () => {
    const tracker = createOperationTracker()
    await expect(tracker.track(Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})
