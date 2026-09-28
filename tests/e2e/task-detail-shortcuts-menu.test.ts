import { describe, it, expect } from 'vitest'
import type { Page } from 'playwright'
import { openProject, openTaskDetail, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

async function runHeaderShortcut(page: Page, shortcutName: string): Promise<void> {
  const trigger = testId(page, 'task-detail-actions-menu-trigger')
  await trigger.waitFor({
    state: 'visible',
    timeout: 15000,
  })
  await trigger.click()
  const selector = `[data-testid="task-actions-shortcut"]` + `[data-shortcut-name="${shortcutName}"]`
  await page.locator(selector).first().waitFor({
    state: 'attached',
    timeout: 15000,
  })
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) throw new Error(`shortcut item not in DOM: ${sel}`)
    el.click()
  }, selector)
}

describe('Task detail shortcuts menu (e2e, real server)', () => {
  const ctx = setupE2E()
  it('running a header shortcut triggers a shortcut request', async () => {
    await openProject(ctx, {
      slugBase: 'tdsm-run',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      appLauncherConfig: {
        templates: [],
        skills: [],
        profiles: [],
        shortcuts: [
          {
            name: 'Open in Editor',
            command: 'echo {{taskDir}}',
          },
        ],
      },
    })
    await openTaskDetail(ctx.page, 't-1-alpha')
    const serverRequests: string[] = []
    ctx.page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/_server')) serverRequests.push(url)
    })
    await runHeaderShortcut(ctx.page, 'Open in Editor')
    await expect
      .poll(() => serverRequests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
  })
  it('the task actions menu remains available when no shortcuts are configured', async () => {
    await openProject(ctx, {
      slugBase: 'tdsm-empty',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      appLauncherConfig: {
        templates: [],
        skills: [],
        profiles: [],
        shortcuts: [],
      },
    })
    await openTaskDetail(ctx.page, 't-1-alpha')
    await testId(ctx.page, 'task-detail-actions-menu-trigger').click()
    expect(await ctx.page.getByRole('menuitem').allTextContents()).toEqual(['Open task folder', 'Archive', 'Delete'])
    expect(await testId(ctx.page, 'task-actions-open-worktree').count()).toBe(0)
  })
})
