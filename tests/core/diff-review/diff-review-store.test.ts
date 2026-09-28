import { afterEach, describe, expect, it } from 'vitest'
import { createConfigPaths, type ConfigPaths } from '../../../src/core/config/config-paths.js'
import { createConfigRepository } from '../../../src/core/config/config-repository.js'
import type { DiffReviewProjectState } from '../../../src/core/diff-review/diff-review-types.js'
import { makeTempDir, removeTempDirOrWarn } from '../../test-temp.js'
import { createDiffReviewStore, type DiffReviewStore } from '../../../src/core/diff-review/diff-review-store.js'
import type { ReviewPromptSnapshot } from '../../../src/core/diff-review/diff-review-types.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(removeTempDirOrWarn))
})

function promptSnapshot(filePath: string): ReviewPromptSnapshot {
  return {
    scope: 'working',
    filePath,
    newRange: {
      start: 1,
      end: 1,
    },
    selectedLines: [
      {
        type: 'addition',
        text: 'selected',
        newLineNumber: 1,
      },
    ],
    contextBefore: [],
    contextAfter: [],
    selectionFingerprint: 'selection',
    sourceRevision: 'revision',
  }
}

function createStore(): StoreResult {
  const baseDir = makeTempDir('diff-review-store-')
  dirs.push(baseDir)
  const paths = createConfigPaths(baseDir)
  return {
    store: createDiffReviewStore(paths, createConfigRepository()),
    paths,
  }
}

describe('DiffReviewStore', () => {
  it('serializes background delivery behind a client transform without losing either task', async () => {
    const { store } = createStore()
    const head = store.enqueue('project', 'task-a', 'worktree', 'First')
    store.enqueue('project', 'task-b', 'other-worktree', 'Second')
    const current = store.getTask('project', 'task-a', 'worktree', 'browser')
    expect(() => store.getTask('project', 'task-b', 'other-worktree', 'other-browser')).toThrow(/being updated/)
    const delivery = store.whenWritable('project', () => store.beginDelivery('project', 'task-a', 'worktree', head.id))
    expect(store.getTask('project', 'task-a', 'worktree').queue.items[0].state).toBe('waiting')
    store.updateTask(
      'project',
      'task-a',
      'worktree',
      () => ({
        ...current,
        reviewedLines: {
          line: {
            path: 'a.ts',
            reviewedAt: new Date().toISOString(),
          },
        },
      }),
      'browser',
    )
    await delivery
    const restored = store.getTask('project', 'task-a', 'worktree')
    expect(restored.queue.items[0].state).toBe('delivering')
    expect(Object.keys(restored.reviewedLines)).toEqual(['line'])
    expect(store.getTask('project', 'task-b', 'other-worktree').queue.items[0].feedback).toBe('Second')
  })
  it('releases failed saves and rejects stale worktree state', () => {
    const { store } = createStore()
    const current = store.getTask('project', 'task', 'old-worktree', 'browser')
    expect(() => store.updateTask('project', 'task', 'new-worktree', () => current, 'browser')).toThrow(/worktree changed/)
    const next = store.getTask('project', 'task', 'new-worktree', 'next-browser')
    expect(next.queue.items).toEqual([])
    store.release('project', 'next-browser')
    expect(() => store.updateTask('project', 'task', 'new-worktree', () => next, 'next-browser')).toThrow(/missing or expired/)
  })
  it('migrates legacy queues on the next successful write', () => {
    const { store, paths } = createStore()
    const repository = createConfigRepository()
    repository.writeJson(paths.diffReviewStateFile('project'), {
      version: 1,
      tasks: {
        task: {
          worktreeIdentity: 'worktree',
          queue: {
            items: [],
          },
        },
      },
    })
    const current = store.getTask('project', 'task', 'worktree', 'browser')
    expect(current.reviewedLines).toEqual({})
    store.updateTask('project', 'task', 'worktree', () => current, 'browser')
    expect(repository.readJson(paths.diffReviewStateFile('project'))).toEqual({
      version: 2,
      tasks: {
        task: current,
      },
    })
  })
  it('persists immutable FIFO prompts and reviewed lines', () => {
    const { store } = createStore()
    const snapshot = promptSnapshot('src/a.ts')
    store.updateTask('project', 'st-1-task', 'worktree', (current) => ({
      ...current,
      reviewedLines: {
        'l-1': {
          path: 'src/a.ts',
          reviewedAt: new Date().toISOString(),
        },
      },
    }))
    const first = store.enqueue('project', 'st-1-task', 'worktree', 'First', snapshot)
    const second = store.enqueue('project', 'st-1-task', 'worktree', 'Second', promptSnapshot('src/b.ts'))
    snapshot.filePath = 'changed-after-enqueue.ts'
    expect(first.snapshot?.filePath).toBe('src/a.ts')
    first.feedback = 'Changed after enqueue'
    const restored = store.getTask('project', 'st-1-task', 'worktree')
    expect(Object.keys(restored.reviewedLines)).toEqual(['l-1'])
    expect(restored.queue.items.map((item) => item.id)).toEqual([first.id, second.id])
    expect(restored.queue.items.map((item) => item.feedback)).toEqual(['First', 'Second'])
  })
  it('keeps errors stopped until Retry and replaces state for a different worktree', () => {
    const { store } = createStore()
    const item = store.enqueue('project', 'st-1-task', 'old-worktree', 'Feedback', promptSnapshot('src/a.ts'))
    store.beginDelivery('project', 'st-1-task', 'old-worktree', item.id)
    store.failDelivery('project', 'st-1-task', 'old-worktree', item.id, {
      title: 'Review delivery failed',
      description: 'delivery failed',
    })
    expect(store.getTask('project', 'st-1-task', 'old-worktree').queue.items[0].state).toBe('error')
    store.retry('project', 'st-1-task', 'old-worktree', item.id)
    expect(store.getTask('project', 'st-1-task', 'old-worktree').queue.items[0].state).toBe('waiting')
    expect(store.getTask('project', 'st-1-task', 'new-worktree').queue.items).toEqual([])
  })
  it('retries a delivered head and refuses one that is still delivering', () => {
    const { store } = createStore()
    const item = store.enqueue('project', 'st-1-task', 'worktree', 'Feedback')
    store.beginDelivery('project', 'st-1-task', 'worktree', item.id)
    store.completeDelivery('project', 'st-1-task', 'worktree', item.id, new Date('2026-07-25T12:00:00.000Z'), 3000)
    store.retry('project', 'st-1-task', 'worktree', item.id)
    const head = store.getTask('project', 'st-1-task', 'worktree').queue.items[0]
    expect(head.state).toBe('waiting')
    expect('sentAt' in head).toBe(false)
    store.beginDelivery('project', 'st-1-task', 'worktree', item.id)
    expect(() => store.retry('project', 'st-1-task', 'worktree', item.id)).toThrow(/failed, uncertain, or delivered/)
  })
  it('removes all persisted review data with the Task', async () => {
    const { store, paths } = createStore()
    store.enqueue('project', 'st-1-task', 'worktree', 'Feedback', promptSnapshot('src/a.ts'))
    await store.removeTask('project', 'st-1-task') // SAFETY: The store just persisted this file using the DiffReviewProjectState shape under test.
    const persisted = createConfigRepository().readJson(paths.diffReviewStateFile('project')) as DiffReviewProjectState
    expect(persisted.tasks).toEqual({})
  })
})

export interface StoreResult {
  store: DiffReviewStore
  paths: ConfigPaths
}
