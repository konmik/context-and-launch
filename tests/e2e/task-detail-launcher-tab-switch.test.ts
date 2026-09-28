import { beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { gotoProject, seedProject, readProjectLauncherConfig, setupE2E, type CreatedProject } from './fixtures.js'
import { APP_LAUNCHER, openLauncher } from './task-detail-launcher-shared.js'
import { testId } from './locators.js'

describe.each(['production', 'development'] as const)('Task detail launcher tab switching (%s, real server)', (mode) => {
  const ctx = setupE2E({
    serverOpts: {
      mode,
    },
  })
  let project: CreatedProject
  beforeAll(async () => {
    const warmup = await ctx.newPage()
    await warmup.emulateMedia({
      reducedMotion: 'reduce',
    })
    project = await seedProject(ctx, {
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
    await warmup.goto(`${ctx.testServer.baseUrl}/project/${project.projectSlug}`)
    await testId(warmup, 'kanban-board-task-card', {
      'data-folder-name': 't-1-alpha',
    }).click()
    await warmup.locator('.cm-content:visible').waitFor()
    await warmup.close()
  })
  beforeEach(async () => {
    await ctx.page.emulateMedia({
      reducedMotion: 'reduce',
    })
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openLauncher(ctx)
    await expect.poll(() => ctx.page.locator('.cm-content:visible').count()).toBe(1)
  })
  it('keeps the prompt visible and editable after switching through the file editor', async () => {
    const prompt = ctx.page.locator('.cm-content:visible')
    await expect.poll(() => prompt.textContent()).toContain('do it in ')
    const originalPrompt = await prompt.textContent()
    await testId(ctx.page, 'task-detail-tab-editor').click()
    await expect.poll(() => readProjectLauncherConfig(ctx.testServer, project.projectSlug)?.columnDefaults?.todo?.lastLayer).toBe('editor')
    await expect.poll(() => prompt.textContent()).toBe('Original context')
    await testId(ctx.page, 'task-detail-tab-launcher').click()
    await expect
      .poll(() => readProjectLauncherConfig(ctx.testServer, project.projectSlug)?.columnDefaults?.todo?.lastLayer)
      .toBe('launcher')
    await expect.poll(() => ctx.page.locator('.cm-editor').count()).toBe(1)
    await expect.poll(() => prompt.textContent()).toBe(originalPrompt)
    const promptBounds = await ctx.page.locator('.cm-editor:visible').boundingBox()
    const panelBounds = await ctx.page.locator('[data-scope="floating-panel"][data-part="content"]').boundingBox()
    expect(promptBounds).not.toBeNull()
    expect(panelBounds).not.toBeNull()
    expect(promptBounds!.height).toBeGreaterThan(100)
    expect(promptBounds!.width).toBeGreaterThan(100)
    expect(promptBounds!.x + promptBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width)
    expect(promptBounds!.y + promptBounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height)
    await prompt.fill('Keep this prompt across tabs')
    for (let cycle = 0; cycle < 2; cycle++) {
      await testId(ctx.page, 'task-detail-tab-editor').click()
      await expect.poll(() => prompt.textContent()).toBe('Original context')
      await testId(ctx.page, 'task-detail-tab-launcher').click()
      await expect.poll(() => prompt.textContent()).toBe('Keep this prompt across tabs')
      expect(await testId(ctx.page, 'prompt-preview-edit-toggle').isChecked()).toBe(true)
    }
    await prompt.fill('Still editable after switching')
    expect(await prompt.textContent()).toBe('Still editable after switching')
    await testId(ctx.page, 'prompt-preview-edit-toggle').uncheck()
    await expect.poll(() => prompt.textContent()).toContain('do it in ')
  })
})
