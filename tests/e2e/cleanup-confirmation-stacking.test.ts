import { describe, expect, it } from 'vitest'
import { clickTicketMenuItem, listTicketFolders, openProject, setupE2E } from './fixtures.js'
import { testId } from './locators.js'

describe('Cleanup confirmation stacking (e2e, real server)', () => {
  const ctx = setupE2E()
  it('keeps the cleanup dialog visible and inert until confirmation closes', async () => {
    const project = await openProject(ctx, {
      slugBase: 'cleanup-confirmation-stack',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await clickTicketMenuItem(ctx.page, 'archive')
    const submit = testId(ctx.page, 'ticket-cleanup-submit')
    await submit.click()
    const cancel = testId(ctx.page, 'ticket-cleanup-confirm-cancel')
    await cancel.waitFor()
    expect(await submit.isVisible()).toBe(true)
    expect(await submit.evaluate((element) => !!element.closest('[inert]'))).toBe(true)
    expect(await ctx.page.getByRole('dialog').count()).toBe(2)
    await ctx.page.keyboard.press('Shift+Tab')
    expect(await testId(ctx.page, 'ticket-cleanup-confirm').evaluate((element) => element === document.activeElement)).toBe(true)
    await ctx.page.keyboard.press('Escape')
    await cancel.waitFor({
      state: 'hidden',
    })
    expect(await submit.isVisible()).toBe(true)
    expect(await submit.evaluate((element) => !!element.closest('[inert]'))).toBe(false)
    expect(await submit.evaluate((element) => element === document.activeElement)).toBe(true)
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain('t-1-alpha')
  })
})
