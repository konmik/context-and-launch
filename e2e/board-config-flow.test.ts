import { expect, it } from 'vitest'
import {
  setupE2E,
  seedProject,
  gotoProject,
  openLauncherSettings,
  openLauncherSettingsTab,
  dragElement,
  sortableItem,
  readBoardDefinitions,
  readTicketStatus,
  openTicketDetail,
  readProjectLauncherConfig,
} from './fixtures.js'
import { testId, waitVisible, waitGone } from './locators.js'

const ctx = setupE2E()

it('uses edited board definitions immediately across settings, tickets, projects, and reloads', async () => {
  const folderName = 't-1-alpha'
  const first = await seedProject(ctx, {
    slugBase: 'board-flow-first',
    withBoards: [
      {
        id: 'shared',
        name: 'Shared',
        columns: [
          {
            name: 'todo',
          },
          {
            name: 'done',
          },
        ],
      },
    ],
    withTickets: [
      {
        number: 'T-1',
        title: 'Alpha',
        status: 'todo',
        folderName,
      },
    ],
    appLauncherConfig: {
      profiles: [
        {
          name: 'Default',
          command: 'echo default',
        },
        {
          name: 'Review Agent',
          command: 'echo review',
        },
      ],
    },
  })
  const second = await seedProject(ctx, {
    slugBase: 'board-flow-second',
  })
  await gotoProject(ctx.page, ctx.testServer, first.projectSlug)

  async function expectBoard(columnName: string) {
    await expect.poll(() => testId(ctx.page, 'kanban-board-column-header').allTextContents()).toEqual(['todo', 'done', columnName])
    const header = testId(ctx.page, 'kanban-board-column-header-cell', {
      'data-column-name': columnName,
    })
    expect(await testId(header, 'kanban-board-column-description').textContent()).toBe('Awaiting review')
    expect(await testId(header, 'kanban-board-column-color-line').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgb(9, 105, 218)',
    )
  }

  async function switchProject(projectSlug: string) {
    await testId(ctx.page, 'project-header-project-dropdown-trigger').click()
    await testId(ctx.page, 'project-header-project-item')
      .filter({
        hasText: projectSlug,
      })
      .click()
    await ctx.page.waitForURL(`**/project/${projectSlug}`)
  }

  await openLauncherSettings(ctx.page)
  await openLauncherSettingsTab(ctx.page, 'columns')
  await testId(ctx.page, 'launcher-settings-columns-add-column-btn').click()
  await testId(ctx.page, 'launcher-settings-columns-name-input').fill('Review')
  await testId(ctx.page, 'launcher-settings-columns-desc-input').fill('Awaiting review')
  await testId(ctx.page, 'launcher-settings-columns-color-option', {
    'data-color-hex': '#0969da',
  }).click()
  await testId(ctx.page, 'launcher-settings-columns-form-submit').click()
  await waitGone(ctx.page, 'launcher-settings-columns-name-input')
  await expectBoard('review')
  await testId(ctx.page, 'launcher-settings-close-button').click()
  await waitGone(ctx.page, 'launcher-settings-columns-board-selector')
  await dragElement(
    ctx.page,
    sortableItem(ctx.page, `todo:${folderName}`),
    testId(ctx.page, 'kanban-board-empty-dropzone', {
      'data-column-name': 'review',
    }),
  )
  await sortableItem(ctx.page, `review:${folderName}`).waitFor({
    state: 'visible',
    timeout: 5000,
  })
  await expect.poll(() => readTicketStatus(ctx.testServer, first.projectSlug, folderName)?.status).toBe('review')
  await openTicketDetail(ctx.page, folderName)
  await testId(ctx.page, 'ticket-detail-tab-launcher').click()
  await testId(ctx.page, 'ticket-detail-launcher-profile-select').selectOption('Review Agent')
  await expect
    .poll(() => readProjectLauncherConfig(ctx.testServer, first.projectSlug)?.columnDefaults?.review?.profileName)
    .toBe('Review Agent')
  await testId(ctx.page, 'ticket-detail-close-button').click()
  await openLauncherSettings(ctx.page)
  await openLauncherSettingsTab(ctx.page, 'columns')
  const row = testId(ctx.page, 'launcher-settings-columns-row').filter({
    hasText: 'review',
  })
  await testId(row, 'launcher-settings-columns-edit-button').click()
  await testId(ctx.page, 'launcher-settings-columns-name-input').fill('Verification')
  await testId(ctx.page, 'launcher-settings-columns-form-submit').click()
  await testId(ctx.page, 'launcher-settings-columns-rename-scope-current').click()
  await testId(ctx.page, 'launcher-settings-columns-rename-confirm').click()
  await waitGone(ctx.page, 'launcher-settings-columns-name-input')
  await expectBoard('verification')
  await expect.poll(() => readTicketStatus(ctx.testServer, first.projectSlug, folderName)?.status).toBe('verification')
  await sortableItem(ctx.page, `verification:${folderName}`).waitFor({
    state: 'visible',
    timeout: 5000,
  })
  await testId(ctx.page, 'launcher-settings-close-button').click()
  await waitGone(ctx.page, 'launcher-settings-columns-board-selector')
  expect(readProjectLauncherConfig(ctx.testServer, first.projectSlug)?.columnDefaults?.verification?.profileName).toBe('Review Agent')
  await openTicketDetail(ctx.page, folderName)
  await testId(ctx.page, 'ticket-detail-tab-launcher').click()
  await expect
    .poll(() => testId(ctx.page, 'ticket-detail-launcher-profile-select').inputValue(), {
      timeout: 10000,
    })
    .toBe('Review Agent')
  expect(readProjectLauncherConfig(ctx.testServer, first.projectSlug)?.columnDefaults?.review).toBeUndefined()
  await testId(ctx.page, 'ticket-detail-close-button').click()
  await switchProject(second.projectSlug)
  await expectBoard('verification')
  await openLauncherSettings(ctx.page)
  await openLauncherSettingsTab(ctx.page, 'columns')
  expect(await testId(ctx.page, 'launcher-settings-columns-row').allTextContents()).toEqual([
    expect.stringContaining('todo'),
    expect.stringContaining('done'),
    expect.stringContaining('verification'),
  ])
  await testId(ctx.page, 'launcher-settings-close-button').click()
  await waitGone(ctx.page, 'launcher-settings-columns-board-selector')
  await switchProject(first.projectSlug)
  await ctx.page.reload()
  await waitVisible(ctx.page, 'kanban-board-column-header')
  await expectBoard('verification')
  await sortableItem(ctx.page, `verification:${folderName}`).waitFor({
    state: 'visible',
    timeout: 5000,
  })
  expect(readBoardDefinitions(ctx.testServer)).toEqual([
    {
      id: 'shared',
      name: 'Shared',
      columns: [
        {
          name: 'todo',
        },
        {
          name: 'done',
        },
        {
          name: 'verification',
          description: 'Awaiting review',
          color: '#0969da',
        },
      ],
    },
  ])
  expect(readTicketStatus(ctx.testServer, first.projectSlug, folderName)?.status).toBe('verification')
})
