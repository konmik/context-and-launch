import { describe, expect, it } from 'vitest'
import { clickTaskMenuItem, openProject, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

describe('Overlay portal ownership (e2e, real server)', () => {
  const ctx = setupE2E()
  it('paints popup menus above task cards and accepts pointer clicks', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-card-stacking',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
        {
          number: 'T-2',
          title: 'Beta',
          status: 'todo',
          folderName: 't-2-beta',
        },
        {
          number: 'T-3',
          title: 'Gamma',
          status: 'todo',
          folderName: 't-3-gamma',
        },
      ],
    })
    await ctx.page.reload()
    await testId(ctx.page, 'kanban-board-task-menu-trigger').first().click()
    const archive = testId(ctx.page, 'task-actions-archive')
    await archive.waitFor()
    expect(
      await ctx.page.getByRole('menu').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const covered = []
        for (let y = rect.top + 4; y < rect.bottom; y += 8) {
          for (let x = rect.left + 4; x < rect.right; x += 8) {
            const hit = document.elementFromPoint(x, y)
            if (!element.contains(hit)) covered.push(hit?.outerHTML.slice(0, 200))
          }
        }
        return covered
      }),
    ).toEqual([])
    expect(
      await archive.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return element.contains(hit)
      }),
    ).toBe(true)
    await archive.click()
    await testId(ctx.page, 'task-cleanup-submit').waitFor()
  })
  it('keeps dialogs in their own layer after the launching popup closes', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-portals',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const menu = testId(ctx.page, 'project-header-title-menu-trigger')
    await menu.click()
    await ctx.page.getByRole('menu').waitFor()
    expect(
      await ctx.page.getByRole('menu').evaluate((element) => element.closest('[data-overlay-layer]')?.getAttribute('data-overlay-layer')),
    ).toBe('popups')
    await ctx.page.keyboard.press('Escape')
    await clickTaskMenuItem(ctx.page, 'archive')
    const submit = testId(ctx.page, 'task-cleanup-submit')
    await submit.waitFor()
    expect(await ctx.page.locator('[data-overlay-layer="popups"]').textContent()).toBe('')
    expect(await submit.evaluate((element) => element.closest('[data-overlay-layer]')?.getAttribute('data-overlay-layer'))).toBe('dialogs')
    await submit.click()
    await testId(ctx.page, 'task-cleanup-confirm-cancel').waitFor()
    expect(await submit.isVisible()).toBe(true)
    await ctx.page.keyboard.press('Escape')
    await testId(ctx.page, 'task-cleanup-confirm-cancel').waitFor({
      state: 'hidden',
    })
    expect(await submit.isVisible()).toBe(true)
    expect(await submit.evaluate((element) => element === document.activeElement)).toBe(true)
  })
})
