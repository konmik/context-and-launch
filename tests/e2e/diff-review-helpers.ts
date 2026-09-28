import type { Page } from 'playwright'
import { openTaskMenu } from './fixtures.js'
import { testId } from './locators.js'

export async function openCardReview(page: Page, folderName: string) {
  const card = page.locator(`[data-testid="kanban-board-task-card"][data-folder-name="${folderName}"]`)
  await openTaskMenu(page, testId(card, 'kanban-board-task-menu-trigger'), 'task-actions-review-changes')
  await testId(page, 'task-actions-review-changes').click()
  await testId(page, 'diff-review').waitFor({
    state: 'visible',
    timeout: 10000,
  })
}
