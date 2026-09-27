import { describe, expect, it } from 'vitest'
import { clickTicketMenuItem, openProject, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

describe('Overlay portal ownership (e2e, real server)', () => {
  const ctx = setupE2E()
  it('keeps dialogs in their own layer after the launching popup closes', async () => {
    await openProject(ctx, {
      slugBase: 'overlay-portals',
      withTickets: [
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
    await clickTicketMenuItem(ctx.page, 'archive')
    const submit = testId(ctx.page, 'ticket-cleanup-submit')
    await submit.waitFor()
    expect(await ctx.page.locator('[data-overlay-layer="popups"]').textContent()).toBe('')
    expect(await submit.evaluate((element) => element.closest('[data-overlay-layer]')?.getAttribute('data-overlay-layer'))).toBe('dialogs')
    await submit.click()
    await testId(ctx.page, 'ticket-cleanup-confirm-cancel').waitFor()
    expect(await submit.isVisible()).toBe(true)
    await ctx.page.keyboard.press('Escape')
    await testId(ctx.page, 'ticket-cleanup-confirm-cancel').waitFor({
      state: 'hidden',
    })
    expect(await submit.isVisible()).toBe(true)
    expect(await submit.evaluate((element) => element === document.activeElement)).toBe(true)
  })
})
