import { describe, expect, it } from 'vitest'
import { openProject, openTaskDetail, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

describe('Overlay coordination (e2e, real server)', () => {
  const ctx = setupE2E()
  it('replaces an open dropdown when another trigger is clicked', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-menus',
    })
    const first = testId(ctx.page, 'project-header-title-menu-trigger')
    const second = testId(ctx.page, 'palette-picker-trigger')
    await first.click()
    await ctx.page.getByRole('menu').waitFor()
    await second.click()
    expect(await ctx.page.getByRole('menu').count()).toBe(1)
    expect(await first.getAttribute('aria-expanded')).toBe('false')
    expect(await second.getAttribute('aria-expanded')).toBe('true')
    await ctx.page.keyboard.press('Escape')
    await ctx.page.getByRole('menu').waitFor({
      state: 'hidden',
    })
    expect(await second.evaluate((element) => element === document.activeElement)).toBe(true)
  })
  it('keeps the parent popup visible but inert and restores its draft and focus after a child closes', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-dialogs',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await openTaskDetail(ctx.page, 't-1-alpha')
    const title = testId(ctx.page, 'task-detail-title-input')
    await title.fill('Unfinished title')
    const trigger = testId(ctx.page, 'task-detail-editor-new-file-button')
    await trigger.click()
    await testId(ctx.page, 'task-detail-new-file-name-input').waitFor()
    expect(await ctx.page.getByRole('dialog').count()).toBe(2)
    expect(await title.isVisible()).toBe(true)
    expect(await title.evaluate((element) => !!element.closest('[inert]'))).toBe(true)
    expect(await title.inputValue()).toBe('Unfinished title')
    await ctx.page.keyboard.press('Escape')
    await testId(ctx.page, 'task-detail-new-file-name-input').waitFor({
      state: 'hidden',
    })
    await title.waitFor()
    expect(await title.evaluate((element) => !!element.closest('[inert]'))).toBe(false)
    expect(await title.inputValue()).toBe('Unfinished title')
    expect(await ctx.page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('task-detail-editor-new-file-button')
    expect(await ctx.page.getByRole('dialog').count()).toBe(1)
  })
  it('Escape dismisses a task dropdown without closing its parent popup', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-files',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await openTaskDetail(ctx.page, 't-1-alpha')
    const trigger = testId(ctx.page, 'task-detail-editor-file-dropdown-trigger')
    await trigger.click()
    await testId(ctx.page, 'task-detail-editor-file-dropdown-option').first().waitFor()
    await ctx.page.keyboard.press('Escape')
    expect(await testId(ctx.page, 'task-detail-title-input').isVisible()).toBe(true)
    expect(await testId(ctx.page, 'task-detail-editor-file-dropdown-option').count()).toBe(0)
    expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true)
  })
})
