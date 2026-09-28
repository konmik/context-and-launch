import { describe, it, expect } from 'vitest'
import { openProject, clickTaskMenuItem, setupE2E } from './fixtures.js'
import { testId, waitVisible } from './locators.js'

describe('Kanban board (e2e, real server)', () => {
  const ctx = setupE2E()
  it('renders kanban-board-column-header and kanban-board-column-description', async () => {
    await openProject(ctx, {
      slugBase: 'kb-cols',
      withBoards: [
        {
          id: 'kanban',
          name: 'Kanban',
          columns: [
            {
              name: 'todo',
              description: 'Things to do',
            },
            {
              name: 'done',
            },
          ],
        },
      ],
    })
    const headers = await testId(ctx.page, 'kanban-board-column-header').allTextContents()
    expect(headers.map((h) => h.trim().toLowerCase())).toContain('todo')
    const desc = testId(ctx.page, 'kanban-board-column-description').first()
    expect(await desc.textContent()).toBe('Things to do')
  })
  it('kanban-board-empty-dropzone renders for empty columns', async () => {
    await openProject(ctx, {
      slugBase: 'kb-empty',
    })
    expect(await testId(ctx.page, 'kanban-board-empty-dropzone').count()).toBeGreaterThan(0)
  })
  it('kanban-board-task-card click opens task detail dialog within 500ms', async () => {
    await openProject(ctx, {
      slugBase: 'kb-click',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    }) // Measure from the actual click, excluding Playwright's actionability wait.
    await ctx.page.evaluate(() => {
      document.addEventListener(
        'click',
        () => {
          performance.mark('task-open-start')
          const observer = new MutationObserver(() => {
            const input = document.querySelector('[data-testid="task-detail-number-input"]')
            if (!(input instanceof HTMLElement) || !input.checkVisibility()) return
            performance.measure('task-open', 'task-open-start')
            observer.disconnect()
          })
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
          })
        },
        {
          once: true,
          capture: true,
        },
      )
    })
    await testId(ctx.page, 'kanban-board-task-card').first().click()
    await waitVisible(ctx.page, 'task-detail-number-input')
    const duration = await ctx.page.evaluate(() => performance.getEntriesByName('task-open')[0].duration)
    expect(duration).toBeLessThan(500)
  })
  it('kanban-board-task-menu-trigger opens menu with archive/delete items', async () => {
    await openProject(ctx, {
      slugBase: 'kb-menu',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const trigger = testId(ctx.page, 'kanban-board-task-menu-trigger').first()
    await trigger.click()
    await testId(ctx.page, 'task-actions-archive').waitFor({
      state: 'visible',
      timeout: 10000,
    })
    expect(await testId(ctx.page, 'kanban-board-task-menu-edit').count()).toBe(0)
    expect(await testId(ctx.page, 'task-actions-open-folder').count()).toBe(1)
    expect(await testId(ctx.page, 'task-actions-archive').count()).toBe(1)
    expect(await testId(ctx.page, 'task-actions-delete').count()).toBe(1)
  })
  it('task-actions-archive opens Archive Task dialog', async () => {
    await openProject(ctx, {
      slugBase: 'kb-arch-menu',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await clickTaskMenuItem(ctx.page, 'archive')
    await waitVisible(ctx.page, 'task-cleanup-submit')
  })
  it('task-actions-delete opens Delete Task dialog', async () => {
    await openProject(ctx, {
      slugBase: 'kb-del-menu',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await clickTaskMenuItem(ctx.page, 'delete')
    await waitVisible(ctx.page, 'task-cleanup-submit')
  })
  it('kanban-board-undefined-column and related testids render for orphan-status tasks', async () => {
    await openProject(ctx, {
      slugBase: 'kb-orphan',
      withBoards: [
        {
          id: 'kanban',
          name: 'Kanban',
          columns: [
            {
              name: 'todo',
            },
            {
              name: 'done',
            },
          ],
        },
      ],
      withTasks: [
        {
          number: 'T-9',
          title: 'Orphan',
          status: 'missing-col',
          folderName: 't-9-orphan',
        },
      ],
    })
    await waitVisible(ctx.page, 'kanban-board-undefined-column')
    expect(await testId(ctx.page, 'kanban-board-undefined-column-description').textContent()).toBe('Update manually')
    expect(await testId(ctx.page, 'kanban-board-task-orphaned-status').textContent()).toBe('missing-col')
  })
})
