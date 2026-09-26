import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { seedProject, gotoProject, openTicketDetail, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

describe('Ticket launcher confirmations (e2e, real server)', () => {
  const ctx = setupE2E()

  for (const condition of ['dirty', 'behind'] as const) {
    it(`can cancel and confirm launching from a ${condition} main branch`, async () => {
      const project = await seedProject(ctx, {
        slugBase: `launch-${condition}`,
        withRemote: true,
        mainBranch: 'main',
        withTickets: ['cancel', 'proceed'].map((action, index) => ({
          number: `T-${index + 1}`,
          title: action,
          status: 'todo',
          folderName: `t-${index + 1}-${action}`,
        })),
        appLauncherConfig: {
          profiles: [
            {
              name: 'Record launch',
              command: `node -e "require('node:fs').writeFileSync('launched.txt', 'launched')"`,
            },
          ],
        },
      })
      const git = (...args: string[]) =>
        execFileSync('git', args, {
          cwd: project.projectPath,
          encoding: 'utf8',
          windowsHide: true,
        }).trim()
      if (condition === 'dirty') {
        fs.writeFileSync(path.join(project.projectPath, 'uncommitted.txt'), 'keep this change')
      } else {
        const base = git('rev-parse', 'HEAD')
        git('commit', '--allow-empty', '-m', 'Upstream change')
        git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'))
        git('reset', '--hard', base)
      }
      await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
      const cancel =
        condition === 'dirty'
          ? testId(ctx.page, 'ticket-detail-launcher-dirty-cancel')
          : testId(ctx.page, 'ticket-detail-launcher-behind-remote-cancel')
      const proceed =
        condition === 'dirty'
          ? testId(ctx.page, 'ticket-detail-launcher-dirty-launch-anyway')
          : testId(ctx.page, 'ticket-detail-launcher-behind-remote-proceed')
      const worktreeRoot = path.join(ctx.testServer.dataDir, 'projects', project.projectSlug, 'worktrees')
      for (const [index, action] of ['cancel', 'proceed'].entries()) {
        const folder = `t-${index + 1}-${action}`
        await openTicketDetail(ctx.page, folder)
        await testId(ctx.page, 'ticket-detail-tab-launcher').click()
        await testId(ctx.page, 'ticket-detail-use-worktree-checkbox').check()
        await expect.poll(() => testId(ctx.page, 'launch-dir-display').textContent()).toContain(folder)
        await testId(ctx.page, 'ticket-detail-launcher-run-button').click()
        await cancel.waitFor({ state: 'visible' })
        const marker = path.join(worktreeRoot, folder, 'launched.txt')
        expect(fs.existsSync(marker)).toBe(false)
        await (action === 'cancel' ? cancel : proceed).click()
        await cancel.waitFor({ state: 'hidden' })
        if (action === 'proceed') {
          await expect.poll(() => fs.existsSync(marker), { timeout: 15_000 }).toBe(true)
          expect(fs.readFileSync(marker, 'utf8')).toBe('launched')
        } else {
          expect(fs.existsSync(marker)).toBe(false)
          await testId(ctx.page, 'ticket-detail-close-window-button').click()
        }
      }
      if (condition === 'dirty') {
        expect(fs.readFileSync(path.join(project.projectPath, 'uncommitted.txt'), 'utf8')).toBe('keep this change')
      }
    })
  }
})
