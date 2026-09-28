import { describe, it, expect } from 'vitest'
import { readProjectLauncherConfig, poll, openTaskDetail, setupE2E } from './fixtures.js'
import { setupLauncherTask } from './task-detail-launcher-shared.js'
import { testId, waitVisible, waitGone } from './locators.js'

describe('Task detail launcher config and run (e2e, real server)', () => {
  const ctx = setupE2E()
  it('profile select persists selection to project launcher config', async () => {
    const project = await setupLauncherTask(ctx, 'profile')
    const profileSelect = ctx.page.locator('[data-testid="task-detail-launcher-profile-select"]')
    await profileSelect.selectOption('GPT')
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.['todo']?.profileName === 'GPT',
      5000,
    )
    expect(cfg?.columnDefaults?.['todo']?.profileName).toBe('GPT')
    await expect.poll(() => profileSelect.inputValue()).toBe('GPT')
  })
  it('template select persists selection to project launcher config', async () => {
    const project = await setupLauncherTask(ctx, 'template')
    await ctx.page.selectOption('[data-testid="task-detail-launcher-template-select"]', 'Other')
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.['todo']?.templateName === 'Other',
      5000,
    )
    expect(cfg?.columnDefaults?.['todo']?.templateName).toBe('Other')
  })
  it('skill checkbox toggle persists to project launcher config', async () => {
    const project = await setupLauncherTask(ctx, 'skill-toggle')
    const cb = ctx.page.locator('[data-testid="task-detail-launcher-skill-checkbox"][data-skill-name="alpha-skill"]')
    await cb.waitFor({
      state: 'visible',
      timeout: 15000,
    })
    await cb.check()
    const cfg = await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.['todo']?.checkedSkills?.includes('alpha-skill') ?? false,
      5000,
    )
    expect(cfg?.columnDefaults?.['todo']?.checkedSkills).toContain('alpha-skill')
  })
  it('keeps the launcher tab active after closing and reopening without reload', async () => {
    const project = await setupLauncherTask(ctx, 'tab-persist')
    await poll(
      () => readProjectLauncherConfig(ctx.testServer, project.projectSlug),
      (c) => c?.columnDefaults?.['todo']?.lastLayer === 'launcher',
      5000,
    )
    await testId(ctx.page, 'task-detail-close-window-button').click()
    await waitGone(ctx.page, 'task-detail-tab-editor')
    await openTaskDetail(ctx.page, 't-1-alpha')
    await waitVisible(ctx.page, 'task-detail-launcher-run-button')
  })
  it('launch target selects the project directory when worktree is off', async () => {
    await setupLauncherTask(ctx, 'dir-off')
    const target = ctx.page.getByRole('combobox', {
      name: 'Launch target',
      exact: true,
    })
    await target.waitFor({
      state: 'visible',
      timeout: 15000,
    })
    expect(await target.inputValue()).toBe('')
    expect(await target.locator('option:checked').textContent()).toBe('Project directory')
  })
  it('launch dir display updates when the worktree selection changes', async () => {
    await setupLauncherTask(ctx, 'dir-toggle')
    const target = ctx.page.getByRole('combobox', {
      name: 'Launch target',
      exact: true,
    })
    await target.waitFor({
      state: 'visible',
      timeout: 15000,
    })
    expect(await target.inputValue()).toBe('')
    await ctx.page
      .getByRole('button', {
        name: 'Add worktree',
        exact: true,
      })
      .click()
    await expect
      .poll(() => target.inputValue(), {
        timeout: 10000,
      })
      .toContain('t-1-alpha')
    expect(await target.locator('option:checked').textContent()).toBe(await target.inputValue())
    await target.selectOption('')
    await expect
      .poll(() => target.inputValue(), {
        timeout: 10000,
      })
      .toBe('')
    expect(await target.locator('option:checked').textContent()).toBe('Project directory')
  })
})
