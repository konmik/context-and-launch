import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTaskRepository } from '../../../src/core/task/task-repository.js'
import { createTaskStore } from '../../../src/core/task/task-store.js'

describe('TaskRepository', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
      })
    }
  })
  it('rejects malformed Dependency and Group fields at the status.json boundary', () => {
    const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-repository-'))
    dirs.push(taskDir)
    fs.writeFileSync(
      path.join(taskDir, 'status.json'),
      JSON.stringify({
        number: 'A-1',
        title: 'Alpha',
        status: 'todo',
        useWorktree: false,
        dependsOn: 'B-1',
        memberOf: 42,
      }),
    )
    expect(createTaskRepository().readStatusJson(taskDir)).toBeNull()
  })
  it('can update a task while board status reads are in flight', async () => {
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-repository-'))
    dirs.push(worktreeDir)
    const store = createTaskStore(worktreeDir)
    const task = store.createTask('A-1', 'Alpha')
    const reads = Array.from(
      {
        length: 32,
      },
      () => store.loadBoardSnapshot(['todo', 'backlog']),
    )
    try {
      await fs.promises.readdir(worktreeDir)
      await fs.promises.stat(path.join(worktreeDir, task.folderName, 'status.json'))
      store.updateTask(task.folderName, null, null, 'backlog')
      expect(store.getTask(task.folderName)?.status).toBe('backlog')
    } finally {
      await Promise.all(reads)
    }
    expect((await store.loadBoardSnapshot(['todo', 'backlog'])).tasks[0].status).toBe('backlog')
  })
  it('surfaces unreadable status files during board loading', async () => {
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-repository-'))
    dirs.push(worktreeDir)
    fs.mkdirSync(path.join(worktreeDir, 'a-1-alpha', 'status.json'), {
      recursive: true,
    })
    await expect(createTaskStore(worktreeDir).loadBoardSnapshot(['todo'])).rejects.toThrow()
  })
})
