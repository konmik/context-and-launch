import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { git } from '../../test-git.js'
import { makeCleanupEnv } from './worktree-cleanup.test-utils.js'

describe('WorktreeCleanupService errors', () => {
  const { setup, cleanupAll } = makeCleanupEnv()
  afterAll(cleanupAll)
  it.concurrent('cleanup with dirty worktree throws and changes nothing', async () => {
    const { projectDir, awm, service } = setup()
    const folderName = 'st-cleanup-dirty'
    const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName)
    expect(result.type).toBe('Success')
    if (result.type === 'Failure') return
    fs.writeFileSync(path.join(result.value.worktreePath, 'dirty.txt'), 'uncommitted')
    await expect(
      service.cleanup(projectDir, folderName, result.value.worktreePath, {
        deleteWorktree: true,
        deleteLocalBranch: true,
        deleteRemoteBranch: false,
      }),
    ).rejects.toThrow(/uncommitted changes/)
    expect(fs.existsSync(result.value.worktreePath)).toBe(true)
    const branchList = await git(projectDir, 'branch', '--list', folderName)
    expect(branchList.trim()).toBeTruthy()
  })
  it.concurrent('cleanup with deleteRemoteBranch checked but no remote throws and changes nothing', async () => {
    const { projectDir, awm, service } = setup()
    const folderName = 'st-cleanup-noremote'
    const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName)
    expect(result.type).toBe('Success')
    if (result.type === 'Failure') return
    await expect(
      service.cleanup(projectDir, folderName, result.value.worktreePath, {
        deleteWorktree: false,
        deleteLocalBranch: false,
        deleteRemoteBranch: true,
      }),
    ).rejects.toThrow(/does not exist/)
    expect(fs.existsSync(result.value.worktreePath)).toBe(true)
  })
  it.concurrent('cleanup with unmerged branch throws before deleting the worktree', async () => {
    const { projectDir, awm, service } = setup()
    const folderName = 'st-cleanup-unmerged'
    const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName)
    expect(result.type).toBe('Success')
    if (result.type === 'Failure') return
    fs.writeFileSync(path.join(result.value.worktreePath, 'feature.txt'), 'new feature')
    await git(result.value.worktreePath, 'add', '.')
    await git(result.value.worktreePath, 'commit', '-m', 'add feature')
    await expect(
      service.cleanup(projectDir, folderName, result.value.worktreePath, {
        deleteWorktree: true,
        deleteLocalBranch: true,
        deleteRemoteBranch: false,
      }),
    ).rejects.toThrow(/unmerged/i)
    expect(fs.existsSync(result.value.worktreePath)).toBe(true)
    const branchList = await git(projectDir, 'branch', '--list', folderName)
    expect(branchList.trim()).toBeTruthy()
  })
  it.concurrent('cleanup with busy worktree throws and changes nothing', async () => {
    const { projectDir, awm, service } = setup()
    const folderName = 'st-cleanup-busy'
    const result = await awm.ensureAgentWorktree(projectDir, 'my-proj', folderName)
    expect(result.type).toBe('Success')
    if (result.type === 'Failure') return
    const child: ChildProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      cwd: result.value.worktreePath,
      stdio: 'pipe',
    })
    try {
      await new Promise((r) => setTimeout(r, 200))
      await expect(
        service.cleanup(
          projectDir,
          folderName,
          result.value.worktreePath,
          {
            deleteWorktree: true,
            deleteLocalBranch: true,
            deleteRemoteBranch: false,
          },
          undefined,
        ),
      ).rejects.toThrow(/in use by another process/)
      expect(fs.existsSync(result.value.worktreePath)).toBe(true)
      const branchList = await git(projectDir, 'branch', '--list', folderName)
      expect(branchList.trim()).toBeTruthy()
    } finally {
      child.kill()
    }
  })
})
