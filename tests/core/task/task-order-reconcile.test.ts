import { describe, it, expect } from 'vitest'
import { reconcileOrder } from '../../../src/core/task/task-order-reconcile.js'
import type { TaskInfo } from '../../../src/core/task/task-store.js'

function task(folderName: string, status: string): TaskInfo {
  return {
    number: '',
    title: '',
    status,
    folderName,
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
  }
}

describe('reconcileOrder', () => {
  it('groups tasks by status, preserves existing order, appends new', () => {
    const existing = {
      todo: ['c', 'a', 'deleted'],
    }
    const tasks = [task('a', 'todo'), task('c', 'todo'), task('new-one', 'todo'), task('d', 'done')]
    const { order, changed } = reconcileOrder(existing, tasks, ['todo', 'done'])
    expect(order['todo']).toEqual(['c', 'a', 'new-one'])
    expect(order['done']).toEqual(['d'])
    expect(changed).toBe(true)
  })
  it('returns changed=false when nothing changes', () => {
    const existing = {
      todo: ['a'],
      done: ['b'],
    }
    const tasks = [task('a', 'todo'), task('b', 'done')]
    const { order, changed } = reconcileOrder(existing, tasks, ['todo', 'done'])
    expect(order).toEqual(existing)
    expect(changed).toBe(false)
  })
  it('returns empty order for empty columns', () => {
    const { order } = reconcileOrder({}, [task('a', 'todo')], [])
    expect(order).toEqual({})
  })
})
