import type { Page } from 'playwright'
import { openTicketMenu } from './fixtures.js'
import { testId } from './locators.js'

export async function openCardReview(page: Page, folderName: string) {
  const card = page.locator(`[data-testid="kanban-board-ticket-card"][data-folder-name="${folderName}"]`)
  await openTicketMenu(page, testId(card, 'kanban-board-ticket-menu-trigger'), 'kanban-board-ticket-menu-review-changes')
  await testId(page, 'kanban-board-ticket-menu-review-changes').click()
  await testId(page, 'diff-review').waitFor({
    state: 'visible',
    timeout: 10000,
  })
}
