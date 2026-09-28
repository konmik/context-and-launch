import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createTaskOrderStore } from '../../../src/core/task/task-order.js'
import { moveTaskInOrder } from '../../../src/core/task/task-order-data.js'
import { createTaskStore } from '../../../src/core/task/task-store.js'
import { git } from '../../test-git.js'
import type { TaskInfo } from '../../../src/core/task/task-store.js'

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function cleanup(...dirs: string[]) {
  for (const d of dirs) {
    try {
      fs.rmSync(d, {
        recursive: true,
        force: true,
      })
    } catch (err) {
      console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function createGitWorktree(withGit = false): Promise<string> {
  const dir = tmpDir('task-order-test-')
  if (withGit) {
    await git(dir, 'init')
    await git(dir, 'commit', '--allow-empty', '-m', 'init')
  }
  return dir
}

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

describe('TaskOrderStore', () => {
  const dirs: string[] = []
  afterAll(() => {
    cleanup(...dirs)
    dirs.length = 0
  })
  it.concurrent('read returns empty object when file is missing', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    expect(createTaskOrderStore(dir).read()).toEqual({})
  })
  it.concurrent('write persists to disk without committing', async () => {
    const dir = await createGitWorktree(true)
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a', 'b'],
      done: ['c'],
    })
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'task-order.json'), 'utf-8'))).toEqual({
      todo: ['a', 'b'],
      done: ['c'],
    }) // No autoCommit: changes remain uncommitted
    const status = await git(dir, 'status', '--porcelain')
    expect(status.trim()).not.toBe('')
  })
  it.concurrent('reconcile groups by status, preserves order, appends new, removes stale', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['c', 'a', 'deleted'],
    })
    const result = store.reconcileAndSave(
      [task('a', 'todo'), task('c', 'todo'), task('new-one', 'todo'), task('d', 'done')],
      ['todo', 'done'],
    )
    expect(result['todo']).toEqual(['c', 'a', 'new-one'])
    expect(result['done']).toEqual(['d'])
  })
  it.concurrent('reconcile moves task when status disagrees with order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a'],
      done: [],
    })
    const result = store.reconcileAndSave([task('a', 'done')], ['todo', 'done'])
    expect(result['todo']).toEqual([])
    expect(result['done']).toEqual(['a'])
  })
  it.concurrent('moveTask within same column', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a', 'b', 'c'],
    })
    store.write(moveTaskInOrder(store.read(), 'a', 'todo', 'todo', 2))
    expect(store.read()['todo']).toEqual(['b', 'c', 'a'])
  })
  it.concurrent('moveTask between columns', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a', 'b'],
      done: ['c'],
    })
    store.write(moveTaskInOrder(store.read(), 'a', 'todo', 'done', 0))
    const result = store.read()
    expect(result['todo']).toEqual(['b'])
    expect(result['done']).toEqual(['a', 'c'])
  })
  it.concurrent('round trip preserves configured empty columns and serialized order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a'],
      'in-progress': [],
      done: [],
    })
    const before = fs.readFileSync(path.join(dir, 'task-order.json'), 'utf-8')
    store.write(moveTaskInOrder(store.read(), 'a', 'todo', 'in-progress', 0))
    store.write(moveTaskInOrder(store.read(), 'a', 'in-progress', 'todo', 0))
    expect(fs.readFileSync(path.join(dir, 'task-order.json'), 'utf-8')).toBe(before)
  })
  it.concurrent('appendTask adds to end', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a'],
    })
    store.appendTask('b', 'todo')
    expect(store.read()['todo']).toEqual(['a', 'b'])
  })
  it.concurrent('rejects a stale replacement without overwriting another writer', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a'],
    })
    const expected = store.read()
    createTaskOrderStore(dir).appendTask('b', 'todo')
    expect(() =>
      store.write(
        {
          todo: ['a'],
          done: [],
        },
        expected,
      ),
    ).toThrow('changed in another request')
    expect(store.read()).toEqual({
      todo: ['a', 'b'],
    })
    store.write(
      {
        todo: ['b', 'a'],
      },
      store.read(),
    )
    expect(store.read()).toEqual({
      todo: ['b', 'a'],
    })
  })
  it.concurrent('removeTask removes from all columns', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['a', 'b'],
      done: ['a', 'c'],
    })
    store.removeTask('a')
    expect(store.read()['todo']).toEqual(['b'])
    expect(store.read()['done']).toEqual(['c'])
  })
  it.concurrent('renameTask updates folder name in place', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    store.write({
      todo: ['old', 'b'],
    })
    store.renameTask('old', 'new')
    expect(store.read()['todo']).toEqual(['new', 'b'])
  })
  it.concurrent('reconcile with empty columns and one task returns empty order without crashing', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskOrderStore(dir)
    const result = store.reconcileAndSave([task('a', 'todo')], [])
    expect(result).toEqual({})
  })
})
describe('TaskStore + TaskOrderStore integration', () => {
  const dirs: string[] = []
  afterAll(() => {
    cleanup(...dirs)
    dirs.length = 0
  })
  it.concurrent('createTask appends to order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskStore(dir)
    store.createTask('A-1', 'First', 'todo')
    store.createTask('B-2', 'Second', 'done')
    const order = store.orderStore.read()
    expect(order['todo']).toEqual(['a-1-first'])
    expect(order['done']).toEqual(['b-2-second'])
  })
  it.concurrent('deleteTask removes from order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskStore(dir)
    store.createTask('A-1', 'First', 'todo')
    store.createTask('B-2', 'Second', 'todo')
    store.deleteTask('a-1-first')
    expect(store.orderStore.read()['todo']).toEqual(['b-2-second'])
  })
  it.concurrent('updateTask with rename updates order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskStore(dir)
    store.createTask('A-1', 'Old Title', 'todo')
    store.updateTask('a-1-old-title', null, 'New Title', null)
    const order = store.orderStore.read()
    expect(order['todo']).toContain('a-1-new-title')
    expect(order['todo']).not.toContain('a-1-old-title')
  })
})
describe('task status and order persistence', () => {
  const dirs: string[] = []
  afterAll(() => {
    cleanup(...dirs)
    dirs.length = 0
  })
  it.concurrent('loadBoardSnapshot returns tasks and reconciled order', async () => {
    const dir = await createGitWorktree()
    dirs.push(dir)
    const store = createTaskStore(dir)
    store.createTask('L-1', 'First', 'todo')
    store.createTask('L-2', 'Second', 'done')
    const { tasks, taskOrder } = await store.loadBoardSnapshot(['todo', 'done'])
    expect(tasks.length).toBe(2)
    expect(taskOrder['todo']).toEqual(['l-1-first'])
    expect(taskOrder['done']).toEqual(['l-2-second'])
  })
})
