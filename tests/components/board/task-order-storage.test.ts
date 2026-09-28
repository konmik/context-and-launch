import type { Success } from '../../../src/util/result.js'
import { expect, it } from 'vitest'
import { createRoot, createSignal, flush } from 'solid-js'
import { createTaskOrderStorage } from '../../../src/components/board/task-order-storage.js'
import { moveTaskInOrder, type TaskOrder } from '~/core/task/task-order-data.js'
import { failure, success } from '~/util/result.js'

it('updates fresh disk order, publishes only successful writes, and follows refreshed snapshots', async () => {
  let dispose!: () => void
  let disk: TaskOrder = {
    todo: ['a', 'b', 'external'],
  }
  let reject = false
  const [snapshot, setSnapshot] = createSignal<TaskOrder>({
    todo: ['a', 'b'],
  })
  const storage = createRoot((cleanup) => {
    dispose = cleanup
    return createTaskOrderStorage(
      {
        projectSlug: 'one',
        get order() {
          return snapshot()
        },
      },
      {
        read: async () => success(disk),
        save: async (_project, expected, next) => {
          if (reject)
            return failure({
              title: 'Save failed',
              description: 'conflict',
            })
          expect(expected).toBe(disk)
          disk = next
          return success(disk)
        },
      },
    )
  })
  try {
    flush()
    await storage.update((current) => moveTaskInOrder(current, 'a', 'todo', 'todo', 2))
    expect(storage.get()).toEqual({
      todo: ['b', 'external', 'a'],
    })
    reject = true
    expect(await storage.update(() => ({}))).toEqual(
      failure({
        title: 'Save failed',
        description: 'conflict',
      }),
    )
    expect(storage.get()).toEqual(disk)
    flush(() =>
      setSnapshot({
        done: ['external'],
      }),
    )
    await storage.refresh()
    expect(storage.get()).toEqual({
      done: ['external'],
    })
  } finally {
    dispose()
  }
})
it('keeps an in-flight save with its original project when navigation changes the context', async () => {
  let dispose!: () => void
  let finishRead!: () => void
  let startedRead!: () => void
  const reading = new Promise<void>((resolve) => {
    startedRead = resolve
  })
  const release = new Promise<void>((resolve) => {
    finishRead = resolve
  })
  const saved = new Map<string, TaskOrder>([
    [
      'first',
      {
        todo: ['a'],
      },
    ],
    [
      'second',
      {
        todo: ['b'],
      },
    ],
  ])
  const [selected, setSelected] = createSignal('first')
  const storage = createRoot((cleanup) => {
    dispose = cleanup
    return createTaskOrderStorage(
      {
        get projectSlug() {
          return selected()
        },
        get order() {
          return saved.get(selected())!
        },
      },
      {
        async read(projectSlug): Promise<Success<TaskOrder>> {
          startedRead()
          await release
          return success(saved.get(projectSlug)!)
        },
        async save(projectSlug, _expected, next): Promise<Success<TaskOrder>> {
          saved.set(projectSlug, next)
          return success(next)
        },
      },
    )
  })
  try {
    flush()
    const completion = storage.update((current) => ({
      todo: [...current.todo, 'new'],
    }))
    await reading
    flush(() => setSelected('second'))
    finishRead()
    await completion
    expect(saved.get('first')).toEqual({
      todo: ['a', 'new'],
    })
    expect(storage.get()).toEqual({
      todo: ['b'],
    })
  } finally {
    dispose()
  }
})
