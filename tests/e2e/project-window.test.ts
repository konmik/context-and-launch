import { describe, it, expect } from 'vitest'
import { git } from '../test-git.js'
import fs from 'node:fs'
import path from 'node:path'
import {
  createProject,
  uniqueSlug,
  seedProject,
  gotoProject,
  gotoProjectOnFakeClock,
  fastForwardUntilVisible,
  setupE2E,
  readProjectRegistry,
} from './fixtures.js'
import { testId, waitVisible } from './locators.js'

describe('Project window (e2e, real server)', () => {
  const ctx = setupE2E({
    // The watcher-liveness test waits on the server's auto-commit; shorten its debounce.
    serverOpts: {
      env: {
        CONTEXT_LAUNCH_WATCH_DEBOUNCE_MS: '200',
      },
    },
  })
  it('watchers stay live across windows: an external change to a backgrounded project still commits', async () => {
    const a = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug('pw-live-a'),
      withRemote: true,
    })
    const b = await seedProject(ctx, {
      slugBase: 'pw-live-b',
    })
    ctx.projects.push(a)
    await ctx.page.clock.install()
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, a.projectSlug)
    const page2 = await ctx.newPage()
    await gotoProject(page2, ctx.testServer, b.projectSlug) // Project B loaded last. On the old single-window model B's load stopped A's
    // watcher, so this external change to A would never auto-commit and A's
    // sync-pending cache would never invalidate. With additive watching A's
    // watcher stays live: the change commits and A's page picks up the pending
    // badge on its next poll.
    fs.writeFileSync(path.join(a.tasksPath, 'external-note.md'), 'external change')
    await expect
      .poll(async () => (await git(a.tasksPath, 'log', '-1', '--format=%s')).trim(), {
        timeout: 20000,
      })
      .toBe('auto: external changes') // A's page picks the badge up on a later poll, once the server-side watcher
    // has bumped the revision.
    await fastForwardUntilVisible(ctx.page, 'sync-button-pending-badge')
  }, 90000)
  it('focusing a window makes its project the last-used', async () => {
    const f = await seedProject(ctx, {
      slugBase: 'pw-focus-f',
    })
    const g = await seedProject(ctx, {
      slugBase: 'pw-focus-g',
    })
    await gotoProject(ctx.page, ctx.testServer, f.projectSlug)
    const page2 = await ctx.newPage()
    await gotoProject(page2, ctx.testServer, g.projectSlug)
    await expect
      .poll(() => readProjectRegistry(ctx.testServer).lastUsedProjectSlug, {
        timeout: 10000,
      })
      .toBe(g.projectSlug)
    await ctx.page.bringToFront()
    await ctx.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect
      .poll(() => readProjectRegistry(ctx.testServer).lastUsedProjectSlug, {
        timeout: 10000,
      })
      .toBe(f.projectSlug)
  }, 90000)
  it('the open-in-new-window button opens a titled popup and reuses the named target', async () => {
    const c = await seedProject(ctx, {
      slugBase: 'pw-open-c',
    })
    const d = await seedProject(ctx, {
      slugBase: 'pw-open-d',
    })
    await gotoProject(ctx.page, ctx.testServer, c.projectSlug)
    expect(await ctx.page.title()).toContain(c.projectSlug)
    const openRowButton = async () => {
      await ctx.page.bringToFront()
      if (await testId(ctx.page, 'project-header-project-item').first().isVisible()) {
        await ctx.page.keyboard.press('Escape')
        await testId(ctx.page, 'project-header-project-item').first().waitFor({
          state: 'hidden',
          timeout: 5000,
        })
      }
      await testId(ctx.page, 'project-header-project-dropdown-trigger').click()
      const row = ctx.page.locator('[data-testid="project-header-project-item"]', {
        hasText: d.projectSlug,
      })
      await row.waitFor({
        state: 'visible',
        timeout: 10000,
      })
      const button = testId(row, 'project-header-open-window-button')
      await button.waitFor({
        state: 'visible',
        timeout: 10000,
      })
      return button
    }
    const [popup] = await Promise.all([
      ctx.page.waitForEvent('popup'),
      (await openRowButton()).click({
        force: true,
      }),
    ])
    await popup.waitForLoadState()
    expect(popup.url().endsWith(`/project/${d.projectSlug}`)).toBe(true)
    await waitVisible(popup, 'project-header-settings-button')
    expect(await popup.title()).toContain(d.projectSlug)
    expect(ctx.page.url()).toContain(`/project/${c.projectSlug}`)
    const pagesBefore = ctx.page.context().pages().length
    const reopenButton = await openRowButton()
    await Promise.all([
      popup.waitForEvent('domcontentloaded'),
      reopenButton.click({
        force: true,
      }),
    ])
    expect(ctx.page.context().pages().length).toBe(pagesBefore)
    expect(popup.url().endsWith(`/project/${d.projectSlug}`)).toBe(true)
    await popup.close()
  }, 90000)
  it('the open-in-new-window button is disabled for an unavailable project', async () => {
    const e = await seedProject(ctx, {
      slugBase: 'pw-open-e',
    })
    const configFile = path.join(ctx.testServer.dataDir, 'config', 'config.json')
    const registry = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    registry.projects.push({
      path: path.join(ctx.testServer.reposParentDir, 'missing-gone'),
      projectSlug: 'gone-x',
      branch: 'tasks',
    })
    fs.writeFileSync(configFile, JSON.stringify(registry, null, 2))
    await gotoProject(ctx.page, ctx.testServer, e.projectSlug)
    try {
      await testId(ctx.page, 'project-header-project-dropdown-trigger').click()
    } catch (cause) {
      throw new Error(await ctx.page.locator('[data-scope="dialog"][data-part="positioner"]').innerText(), {
        cause,
      })
    }
    const goneRow = ctx.page.locator('[data-testid="project-header-project-item"]', {
      hasText: 'gone-x',
    })
    await goneRow.waitFor({
      state: 'visible',
      timeout: 10000,
    })
    const disabled = await goneRow.locator('[data-testid="project-header-open-window-button"]').isDisabled()
    expect(disabled).toBe(true)
  }, 90000)
})
