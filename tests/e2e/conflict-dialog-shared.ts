import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { commitAll, fetchTasks, git, mutateRemote, type TasksWorktree } from './git-fixtures.js'
import type { SeedAppLauncherConfig } from './fixtures.js'

/** The conflict dialog needs a profile to offer, so every conflict test seeds one. */
export const CONFLICT_LAUNCHER: SeedAppLauncherConfig = {
  profiles: [
    {
      name: 'Claude',
      command: 'echo claude',
    },
  ],
}

function outputBuffer(error: Error, key: 'stdout' | 'stderr'): Buffer | undefined {
  const value = Object.getOwnPropertyDescriptor(error, key)?.value
  return Buffer.isBuffer(value) ? value : undefined
} // Reproduce the state after a user launches conflict resolution: a scratch

// worktree (sibling of the live tasks folder) with a rebase in progress.
// The live tasks folder is left clean on its last good commit.
export function createActiveRebaseConflict(project: TasksWorktree): void {
  const { tasksPath } = project
  fs.writeFileSync(path.join(tasksPath, 'conflict.txt'), 'local\n')
  commitAll(tasksPath, 'local-change')
  mutateRemote(project, {
    message: 'remote-change',
    edit: (clone) => fs.writeFileSync(path.join(clone, 'conflict.txt'), 'remote\n'),
  })
  fetchTasks(project)
  const scratch = `${tasksPath}-conflict-resolve`
  git(`worktree add --detach "${scratch}" HEAD`, tasksPath)
  let rebaseFailed = false
  let rebaseOutput = ''
  try {
    execSync('git rebase origin/tasks', {
      cwd: scratch,
      stdio: 'pipe',
    })
  } catch (error) {
    rebaseFailed = true
    if (!(error instanceof Error)) throw error
    rebaseOutput = [outputBuffer(error, 'stdout'), outputBuffer(error, 'stderr')]
      .map((stream) => (stream ? stream.toString() : ''))
      .join('')
  }
  if (!rebaseFailed) throw new Error('expected rebase to leave a conflict')
  try {
    execSync('git rev-parse --verify REBASE_HEAD', {
      cwd: scratch,
      stdio: 'pipe',
    })
  } catch {
    throw new Error(`expected a rebase in progress in ${scratch}, but git left none.` + ` git rebase output was:\n${rebaseOutput}`)
  }
}
