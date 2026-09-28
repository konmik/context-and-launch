import { describe, it, expect } from 'vitest'
import { openProject, readProjectLauncherConfig, setupE2E } from './fixtures.js'
import { APP_LAUNCHER, openLauncher } from './task-detail-launcher-shared.js'
import { testId } from './locators.js'

describe('Task detail launcher tab switching (e2e, real server)', () => {
  const ctx = setupE2E()
  it('keeps the prompt visible and editable after switching through the file editor', async () => {
    const project = await openProject(ctx, {
      slugBase: 'tdl-tab-switch',
      withTasks: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
          body: 'Original context',
        },
      ],
      appLauncherConfig: {
        ...APP_LAUNCHER,
        skills: Array.from(
          {
            length: 10,
          },
          (_, index) => ({
            name: `review-guidelines-${index}`,
            text: `Review guideline ${index}`,
          }),
        ),
      },
    })
    await openLauncher(ctx)
    const prompt = ctx.page.locator('.cm-content:visible')
    await expect.poll(() => prompt.textContent()).toContain('do it in ')
    const originalPrompt = await prompt.textContent()
    await testId(ctx.page, 'task-detail-tab-editor').click()
    await expect.poll(() => readProjectLauncherConfig(ctx.testServer, project.projectSlug)?.columnDefaults?.todo?.lastLayer).toBe('editor')
    await testId(ctx.page, 'task-detail-tab-launcher').click()
    await expect
      .poll(() => readProjectLauncherConfig(ctx.testServer, project.projectSlug)?.columnDefaults?.todo?.lastLayer)
      .toBe('launcher')
    await expect.poll(() => prompt.textContent()).toBe(originalPrompt)
    const promptBounds = await prompt.boundingBox()
    const panelBounds = await ctx.page.locator('[data-scope="floating-panel"][data-part="content"]').boundingBox()
    expect(promptBounds).not.toBeNull()
    expect(panelBounds).not.toBeNull()
    expect(promptBounds!.x + promptBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width)
    expect(promptBounds!.y + promptBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height)
    await prompt.fill('Keep this prompt across tabs')
    for (let cycle = 0; cycle < 2; cycle++) {
      await testId(ctx.page, 'task-detail-tab-editor').click()
      await testId(ctx.page, 'task-detail-tab-launcher').click()
      await expect.poll(() => prompt.count()).toBe(1)
      expect(await prompt.textContent()).toBe('Keep this prompt across tabs')
      expect(await testId(ctx.page, 'prompt-preview-edit-toggle').isChecked()).toBe(true)
    }
    await prompt.fill('Still editable after switching')
    expect(await prompt.textContent()).toBe('Still editable after switching')
    await testId(ctx.page, 'prompt-preview-edit-toggle').uncheck()
    await expect.poll(() => prompt.textContent()).toContain('do it in ')
  })
})
