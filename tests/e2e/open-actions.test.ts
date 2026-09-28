import { describe, it, expect } from 'vitest'
import type { Page } from 'playwright'
import { openProject, openTaskDetail, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

function trackServerRequests(page: Page): string[] {
  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/_server')) requests.push(req.url())
  })
  return requests
}

async function clickMenuItem(page: Page, triggerSelector: string, itemSelector: string): Promise<void> {
  const trigger = page.locator(triggerSelector).first()
  await trigger.waitFor({
    state: 'visible',
    timeout: 15000,
  })
  await trigger.click()
  await page.locator(itemSelector).first().waitFor({
    state: 'attached',
    timeout: 15000,
  })
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) throw new Error(`menu item not in DOM: ${sel}`)
    el.click()
  }, itemSelector)
}

describe('Open actions (e2e, real server)', () => {
  const ctx = setupE2E()
  it('opens the tasks folder from the title menu', async () => {
    await openProject(ctx, {
      slugBase: 'oa-tasks-folder',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const requests = trackServerRequests(ctx.page)
    await clickMenuItem(
      ctx.page,
      '[data-testid="project-header-title-menu-trigger"]',
      '[data-testid="project-header-open-tasks-folder-menuitem"]',
    )
    await expect
      .poll(() => requests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    expect(await testId(ctx.page, 'error-dialog-ok').count()).toBe(0)
  })
  it('opens the project folder from the title menu', async () => {
    await openProject(ctx, {
      slugBase: 'oa-project-folder',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const requests = trackServerRequests(ctx.page)
    await clickMenuItem(
      ctx.page,
      '[data-testid="project-header-title-menu-trigger"]',
      '[data-testid="project-header-open-project-folder-menuitem"]',
    )
    await expect
      .poll(() => requests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    expect(await testId(ctx.page, 'error-dialog-ok').count()).toBe(0)
  })
  it('opens the task folder from the task card menu', async () => {
    await openProject(ctx, {
      slugBase: 'oa-card-task-folder',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const requests = trackServerRequests(ctx.page)
    await clickMenuItem(ctx.page, '[data-testid="kanban-board-task-menu-trigger"]', '[data-testid="task-actions-open-folder"]')
    await expect
      .poll(() => requests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    expect(await testId(ctx.page, 'error-dialog-ok').count()).toBe(0)
  })
  it('opens the worktree from the task card menu', async () => {
    await openProject(ctx, {
      slugBase: 'oa-card-worktree',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    const requests = trackServerRequests(ctx.page)
    await clickMenuItem(ctx.page, '[data-testid="kanban-board-task-menu-trigger"]', '[data-testid="task-actions-open-worktree"]')
    await expect
      .poll(() => requests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    expect(await testId(ctx.page, 'error-dialog-ok').count()).toBe(0)
  })
  it('opens the worktree from the task detail menu', async () => {
    await openProject(ctx, {
      slugBase: 'oa-detail-worktree',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    await openTaskDetail(ctx.page, 't-1-alpha')
    const requests = trackServerRequests(ctx.page)
    await clickMenuItem(ctx.page, '[data-testid="task-detail-actions-menu-trigger"]', '[data-testid="task-actions-open-worktree"]')
    await expect
      .poll(() => requests.length, {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    expect(await testId(ctx.page, 'error-dialog-ok').count()).toBe(0)
  })
})
