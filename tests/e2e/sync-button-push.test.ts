import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { gotoProject, seedProject, setupE2E } from './fixtures.js'
import { aheadCount, commitAll, fetchTasks, git, mutateRemote, porcelainStatus, pushTasks, remoteLog } from './git-fixtures.js'
import { testId, waitVisible } from './locators.js'
import type { StatusJson } from '../../src/core/task/task-repository.js'

function writeTaskFolder(root: string, folderName: string, status: Pick<StatusJson, 'number' | 'title' | 'status'>): void {
  fs.mkdirSync(path.join(root, folderName), {
    recursive: true,
  })
  fs.writeFileSync(path.join(root, folderName, 'status.json'), JSON.stringify(status))
}

describe('Sync button push behavior (e2e, real server)', () => {
  const ctx = setupE2E()

  async function syncAndWaitForSuccess(): Promise<void> {
    await testId(ctx.page, 'sync-button-trigger').click() // A failed sync reports itself in the error dialog and never shows the check,
    // so watch for both and let the failure speak instead of timing out silently.
    const outcome = ctx.page.locator('[data-testid="sync-button-check-icon"], [data-testid="error-dialog-ok"]')
    await outcome.first().waitFor({
      state: 'visible',
      timeout: 15000,
    })
    const failure = testId(ctx.page, 'error-dialog-ok')
    if ((await failure.count()) > 0) {
      throw new Error(`Sync failed: ${await ctx.page.locator('body').innerText()}`)
    }
    await waitVisible(ctx.page, 'sync-button-check-icon')
  }

  it('diverged without conflict: sync merges and pushes', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'sb-diverged-ok',
      withRemote: true,
      withTasks: [
        {
          number: 'DV-1',
          title: 'Local file',
          status: 'todo',
          folderName: 'dv-1-local-file',
        },
      ],
    })
    pushTasks(project)
    mutateRemote(project, {
      message: 'remote add',
      edit: (clone) =>
        writeTaskFolder(clone, 'dv-2-remote-only', {
          number: 'DV-2',
          title: 'Remote only',
          status: 'todo',
        }),
    })
    fs.writeFileSync(path.join(project.tasksPath, 'dv-1-local-file', 'notes.md'), 'local note')
    fetchTasks(project)
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await syncAndWaitForSuccess()
    expect(remoteLog(project, '--all --format=%s')).toContain('sync: local changes')
  })
  it('multiple commits squashed into one before push', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'sb-squash',
      withRemote: true,
    })
    pushTasks(project)
    writeTaskFolder(project.tasksPath, 'sq-1-first', {
      number: 'SQ-1',
      title: 'First',
      status: 'todo',
    })
    commitAll(project.tasksPath, 'auto: external changes')
    writeTaskFolder(project.tasksPath, 'sq-2-second', {
      number: 'SQ-2',
      title: 'Second',
      status: 'todo',
    })
    commitAll(project.tasksPath, 'auto: external changes')
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await syncAndWaitForSuccess()
    expect(aheadCount(project.tasksPath)).toBe(0)
    const syncLines = remoteLog(project, '--oneline tasks')
      .split('\n')
      .filter((line) => line.includes('sync: local changes'))
    expect(syncLines.length).toBe(1)
  })
  it('no-upstream first sync: pushes and sets tracking', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'sb-no-upstream',
      withRemote: true,
    })
    git('branch --unset-upstream', project.tasksPath)
    writeTaskFolder(project.tasksPath, 'nu-1-test', {
      number: 'NU-1',
      title: 'Test',
      status: 'todo',
    })
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await syncAndWaitForSuccess()
    expect(git('rev-parse --abbrev-ref --symbolic-full-name @{u}', project.tasksPath)).toContain('origin/')
  })
  it('net-zero unpushed commits: sync succeeds and flip.txt does not exist', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'sb-netzero',
      withRemote: true,
    })
    pushTasks(project)
    fs.writeFileSync(path.join(project.tasksPath, 'flip.txt'), 'changed')
    commitAll(project.tasksPath, 'auto: change')
    fs.unlinkSync(path.join(project.tasksPath, 'flip.txt'))
    commitAll(project.tasksPath, 'auto: revert')
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await syncAndWaitForSuccess()
    expect(fs.existsSync(path.join(project.tasksPath, 'flip.txt'))).toBe(false)
    expect(porcelainStatus(project.tasksPath)).toBe('')
  })
})
