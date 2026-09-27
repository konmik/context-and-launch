import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { gotoProject, seedProject, setupE2E } from './fixtures.js'
import { openCardReview } from './diff-review-helpers.js'

describe('Diff Review lifetime', () => {
  const ctx = setupE2E()
  it('closes while a snapshot refresh is pending', async () => {
    const folderName = 't-1-review-close'
    const project = await seedProject(ctx, {
      slugBase: 'review-close',
      withTickets: [
        {
          number: 'T-1',
          title: 'Review close',
          status: 'todo',
          folderName,
        },
      ],
      withWorktrees: [
        {
          folderName,
        },
      ],
    })
    fs.writeFileSync(path.join(project.worktreeRootPath!, folderName, 'example.ts'), 'export const value = 1;\n')
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCardReview(ctx.page, folderName)
    await ctx.page.locator('[data-testid="diff-review-file-diff"]').waitFor({
      state: 'visible',
    })
    await ctx.page.locator('[data-testid="diff-review-refresh"]').dispatchEvent('click')
    await ctx.page.locator('[data-testid="diff-review-close"]').dispatchEvent('click')
    await expect.poll(() => ctx.page.locator('[data-testid="diff-review"]').count()).toBe(0)
  })
})
