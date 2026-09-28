import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'vitest'
import type { Locator, Page } from 'playwright'
import { dragPointer, gotoProject, seedProject, type CreatedProject, type E2EContext, type ScreenPoint, type SeedTask } from './fixtures.js'
import { countOf, testId, waitGone, waitVisible } from './locators.js'

const forestBoards = [
  {
    id: 'default',
    name: 'Default',
    columns: [
      {
        name: 'todo',
      },
      {
        name: 'done',
      },
    ],
  },
]

export type ForestSeedTask = Omit<SeedTask, 'status'> & {
  status?: string
}

export interface OpenForestOptions {
  slugBase: string
  tasks: ForestSeedTask[]
  layout?: Record<
    string,
    {
      x: number
      y: number
    }
  >
  view?: 'forest' | 'kanban'
}

export async function openForestProject(ctx: E2EContext, options: OpenForestOptions): Promise<CreatedProject> {
  const project = await seedProject(ctx, {
    slugBase: options.slugBase,
    withBoards: forestBoards,
    withTasks: options.tasks.map((task) => ({
      status: 'todo',
      ...task,
    })),
  })
  if (options.layout) {
    fs.writeFileSync(path.join(project.tasksPath, 'forest-layout.json'), JSON.stringify(options.layout))
  }
  await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
  if (options.view !== 'kanban') await toggleToForest(ctx.page)
  return project
}

export async function toggleToForest(page: Page): Promise<void> {
  await testId(page, 'project-header-forest-toggle-button').click()
  await waitVisible(page, 'forest-rearrange-button')
}

export async function toggleToKanban(page: Page): Promise<void> {
  await testId(page, 'project-header-forest-toggle-button').click()
  await waitVisible(page, 'kanban-board-column-header')
}

export async function waitForForestTaskCount(page: Page, expected: number): Promise<void> {
  await expect
    .poll(() => countOf(page, 'forest-task-card'), {
      timeout: 15000,
    })
    .toBe(expected)
}

export function forestSurface(page: Page): Locator {
  return testId(page, 'forest-surface')
}

export function forestCard(page: Page, taskNumber: string): Locator {
  return testId(page, 'forest-task-card', {
    'data-task-number': taskNumber,
  })
}

export function forestGroupCard(page: Page, taskNumber?: string): Locator {
  return taskNumber
    ? testId(page, 'forest-group-card', {
        'data-task-number': taskNumber,
      })
    : testId(page, 'forest-group-card')
}

export function forestHandle(page: Page, taskNumber: string, end: 'top' | 'bottom'): Locator {
  return testId(page, `forest-handle-${end}`, {
    'data-task-number': taskNumber,
  })
}

export async function shiftDragSelection(page: Page, from: ScreenPoint, to: ScreenPoint): Promise<void> {
  await page.keyboard.down('Shift')
  await dragPointer(page, from, to)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
}

export async function clickHandle(page: Page, taskNumber: string, end: 'top' | 'bottom'): Promise<void> {
  await page.locator(`[data-forest-card][data-task-number="${taskNumber}"]`).hover()
  await forestHandle(page, taskNumber, end).click()
}

export async function pathScreenPoint(locator: Locator, at: 'start' | 'middle' | 'end'): Promise<ScreenPoint> {
  return await locator.evaluate<ScreenPoint, typeof at, SVGPathElement>((svgPath, position) => {
    const total = svgPath.getTotalLength()
    const length = position === 'start' ? 0 : position === 'middle' ? total / 2 : total
    const point = svgPath.getPointAtLength(length)
    const matrix = svgPath.getScreenCTM()
    if (!matrix) throw new Error('Path is not rendered on screen')
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    }
  }, at)
}

export async function clickPath(locator: Locator, at: 'start' | 'middle' | 'end'): Promise<void> {
  await locator.evaluate<void, typeof at, SVGPathElement>((path, position) => {
    const total = path.getTotalLength()
    const length = position === 'start' ? 0 : position === 'middle' ? total / 2 : total
    const point = path.getPointAtLength(length)
    const matrix = path.getScreenCTM()
    if (!matrix) throw new Error('Path is not rendered on screen')
    const clientX = matrix.a * point.x + matrix.c * point.y + matrix.e
    const clientY = matrix.b * point.x + matrix.d * point.y + matrix.f // The drawn edge ignores pointer events; a wider transparent twin carries the
    // click handler. Address that twin by its own identity rather than by DOM
    // adjacency, which breaks while the edge list re-renders.
    const hit =
      getComputedStyle(path).pointerEvents === 'none'
        ? path.ownerSVGElement?.querySelector(
            `[data-testid="forest-dependency-hit"][data-from="${path.dataset.from}"][data-to="${path.dataset.to}"]`,
          )
        : path
    if (!hit) {
      throw new Error(`No clickable target for dependency ${path.dataset.from} -> ${path.dataset.to}`)
    }
    hit.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX,
        clientY,
      }),
    )
  }, at)
}

export async function pathScreenEndpoints(locator: Locator): Promise<PathScreenEndpointsResult> {
  return {
    start: await pathScreenPoint(locator, 'start'),
    end: await pathScreenPoint(locator, 'end'),
  }
}

/**
 * Opens a dependency's popup. The edge list re-renders while the board settles,
 * which can swap the path out from under a single click, so the click is
 * re-issued until the popup is actually up.
 */
export async function openDependencyPopup(page: Page, path: Locator, at: 'start' | 'middle' | 'end' = 'middle'): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await testId(page, 'forest-dependency-delete').count()) > 0) return true
        await clickPath(path, at)
        return (await testId(page, 'forest-dependency-delete').count()) > 0
      },
      {
        timeout: 15000,
      },
    )
    .toBe(true)
}

export async function deleteDependencyViaPopup(page: Page): Promise<void> {
  const deleteButton = await waitVisible(page, 'forest-dependency-delete')
  await deleteButton.click()
}

export function subforestCloseButton(page: Page): Locator {
  return testId(page, 'forest-subforest-close')
}

export async function openSubforest(page: Page, taskNumber?: string): Promise<void> {
  await forestGroupCard(page, taskNumber).click()
  const closeButton = await waitVisible(page, 'forest-subforest-close')
  await expect.poll(() => closeButton.locator('..').evaluate((element) => getComputedStyle(element).transform)).toBe('none')
}

export async function closeSubforest(page: Page): Promise<void> {
  await subforestCloseButton(page).click()
  await waitGone(page, 'forest-subforest-close')
}

export async function groupViaDialog(page: Page, number: string, title: string): Promise<void> {
  await testId(page, 'forest-group-button').click()
  await waitVisible(page, 'create-task-number-input')
  await testId(page, 'create-task-number-input').fill(number)
  await testId(page, 'create-task-title-input').fill(title)
  await testId(page, 'create-task-submit').click()
  await waitGone(page, 'create-task-number-input')
  await page.waitForTimeout(1000)
}

export interface PathScreenEndpointsResult {
  start: ScreenPoint
  end: ScreenPoint
}
