import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { openProject, setupE2E, THREE_COLUMN_BOARD } from './fixtures.js'

describe('Kanban drop persistence (e2e, real server)', () => {
  const ctx = setupE2E()

  it('keeps the task at its destination while saving and after reloading', async () => {
    const project = await openProject(ctx, {
      slugBase: 'drop-pending',
      withBoards: THREE_COLUMN_BOARD,
      withTasks: [{ number: 'T-1', title: 'Alpha', status: 'todo', folderName: 't-1-alpha' }],
    })
    const page = ctx.page
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const requested = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let held = false
    await page.route('**/_server*', async (route) => {
      if (!held && route.request().method() === 'POST' && route.request().postData()?.includes('t-1-alpha')) {
        held = true
        requested.resolve()
        await release.promise
      }
      await route.continue()
    })
    const source = page.locator('[data-sortable-id="todo:t-1-alpha"]')
    const destination = page.locator('[data-testid="kanban-board-column-body"][data-column-name="done"]')
    const sourceBox = (await source.boundingBox())!
    const targetBox = (await destination.boundingBox())!
    try {
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 30, { steps: 3 })
      await page.mouse.up()
      await requested.promise
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
      expect(await source.count()).toBe(0)
      expect(await page.locator('[data-sortable-id="done:t-1-alpha"]').count()).toBe(1)
      expect(JSON.parse(fs.readFileSync(path.join(project.tasksPath, 't-1-alpha', 'status.json'), 'utf8')).status).toBe('todo')
    } finally {
      release.resolve()
    }
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(project.tasksPath, 'task-order.json'), 'utf8')).done).toEqual(['t-1-alpha'])
    expect(JSON.parse(fs.readFileSync(path.join(project.tasksPath, 't-1-alpha', 'status.json'), 'utf8')).status).toBe('done')
    await page.reload()
    await page.locator('[data-sortable-id="done:t-1-alpha"]').waitFor({ state: 'visible' })
    expect(await source.count()).toBe(0)
  })
})
