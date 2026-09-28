import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createTaskStore } from '../../../src/core/task/task-store.js'
import { moveTaskInOrder } from '../../../src/core/task/task-order-data.js'
import { git } from '../../test-git.js'

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
    } catch {
      // ignore cleanup errors
    }
  }
}

async function createWorktreeDir(): Promise<WorktreeDirResult> {
  const projectDir = tmpDir('case-proj-')
  await git(projectDir, 'init')
  await git(projectDir, 'commit', '--allow-empty', '-m', 'init')
  const worktreeDir = tmpDir('case-wt-')
  fs.rmSync(worktreeDir, {
    recursive: true,
  })
  await git(projectDir, 'worktree', 'add', worktreeDir, '-b', 'case-test')
  return {
    projectDir,
    worktreeDir,
  }
}

describe('case-sensitive column move', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const fn of cleanups) {
      await fn()
    }
    cleanups.length = 0
  })
  it('moving from "Todo" to "todo" updates status without duplicating column keys', async () => {
    const { projectDir, worktreeDir } = await createWorktreeDir()
    cleanups.push(async () => {
      try {
        await git(projectDir, 'worktree', 'remove', '--force', worktreeDir)
      } catch {
        // ignore
      }
      cleanup(projectDir, worktreeDir)
    })
    const store = createTaskStore(worktreeDir) // Create a task with status "Todo" (capitalized)
    const task = store.createTask('CS-1', 'Case Test', 'Todo') // Verify status.json has "Todo"
    const statusBefore = JSON.parse(fs.readFileSync(path.join(worktreeDir, task.folderName, 'status.json'), 'utf-8'))
    expect(statusBefore.status).toBe('Todo') // Read the order file to see the initial state
    const orderStore = store.orderStore
    const orderBefore = orderStore.read()
    expect(orderBefore['Todo']).toContain(task.folderName) // Now move with case-different column names: "Todo" -> "todo"
    store.updateTask(task.folderName, null, null, 'todo')
    orderStore.write(moveTaskInOrder(orderBefore, task.folderName, 'Todo', 'todo', 0)) // Check status.json - should now be "todo"
    const statusAfter = JSON.parse(fs.readFileSync(path.join(worktreeDir, task.folderName, 'status.json'), 'utf-8'))
    expect(statusAfter.status).toBe('todo') // Check order file for consistency
    const orderAfter = orderStore.read() // The bug: "Todo" key still exists (now empty) and "todo" key was created
    // This means the order file has two keys that represent the same column
    // with different casing
    const todoKeys = Object.keys(orderAfter).filter((k) => k.toLowerCase() === 'todo') // If there are two keys (e.g. "Todo" and "todo"), that's a desync bug.
    // A well-behaved system should only have one canonical column key.
    expect(todoKeys.length).toBe(1) // The task should be in exactly one column
    let columnsContainingTask = 0
    for (const col of Object.keys(orderAfter)) {
      if (orderAfter[col].includes(task.folderName)) {
        columnsContainingTask++
      }
    }
    expect(columnsContainingTask).toBe(1)
  })
})

export interface WorktreeDirResult {
  projectDir: string
  worktreeDir: string
}
