import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { Page } from 'playwright'
import {
  openProject,
  clickTicketMenuItem,
  openTicketMenu,
  listTicketFolders,
  worktreeExists,
  poll,
  setupE2E,
  setCommandTemplateOverride,
  seedProject,
  gotoProject,
} from './fixtures.js'
import { branchExists, commitAll, git } from './git-fixtures.js'
import { testId, waitVisible, waitGone } from './locators.js'

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('TicketCleanupDialog (e2e, real server)', () => {
  const ctx = setupE2E()

  async function openCleanup(item: 'archive' | 'delete'): Promise<void> {
    await clickTicketMenuItem(ctx.page, item)
    await waitVisible(ctx.page, 'ticket-cleanup-submit')
  }

  async function waitForChecksSettled(page: Page): Promise<void> {
    await page.waitForFunction(
      () => {
        const nodes = Array.from(document.querySelectorAll('[data-testid^="ticket-cleanup-"][data-testid$="-status"]'))
        return (
          nodes.length === 4 &&
          nodes.every((n) => {
            const state = n.getAttribute('data-state')
            return state !== 'checking' && state !== 'running'
          })
        )
      },
      undefined,
      {
        timeout: 15000,
      },
    )
  }

  it('keeps a cleanup target until its worktree and both branches are deleted', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'tc-selection',
      withRemote: true,
      withTickets: [{ number: 'T-1', title: 'Alpha', status: 'todo', folderName: 't-1-alpha' }],
      withWorktrees: [{ folderName: 't-1-alpha' }, { folderName: 't-1-second' }],
    })
    const firstPath = path.join(project.worktreeRootPath!, 't-1-alpha')
    const secondPath = path.join(project.worktreeRootPath!, 't-1-second')
    git('push origin t-1-second', project.projectPath)
    const statusPath = path.join(project.ticketsPath, 't-1-alpha', 'status.json')
    fs.writeFileSync(statusPath, JSON.stringify({
      ...JSON.parse(fs.readFileSync(statusPath, 'utf8')),
      useWorktree: true,
      agentWorktreeDir: firstPath,
      agentWorktreeBranchName: 't-1-alpha',
      agentWorktrees: [
        { branchName: 't-1-alpha', worktreePath: firstPath },
        { branchName: 't-1-second', worktreePath: secondPath },
      ],
    }))
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    const target = ctx.page.getByRole('combobox', { name: 'Worktree to clean up' })
    expect(await target.inputValue()).toBe(firstPath)
    await target.selectOption(secondPath)
    await waitForChecksSettled(ctx.page)
    expect(await target.inputValue()).toBe(secondPath)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await expect.poll(() => fs.existsSync(secondPath)).toBe(false)
    await waitForChecksSettled(ctx.page)
    expect(await target.locator('option').count()).toBe(2)
    expect(await target.inputValue()).toBe(secondPath)
    await testId(ctx.page, 'ticket-cleanup-delete-local-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await expect.poll(() => branchExists(project.projectPath, 't-1-second')).toBe(false)
    await waitForChecksSettled(ctx.page)
    expect(await target.locator('option').count()).toBe(2)
    expect(await target.inputValue()).toBe(secondPath)
    await testId(ctx.page, 'ticket-cleanup-delete-remote-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await expect.poll(() => target.locator('option').count()).toBe(1)
    expect(await target.inputValue()).toBe(firstPath)
    expect(fs.existsSync(firstPath)).toBe(true)
    await expect.poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').getAttribute('data-state')).toBe('ready')
  })

  it('archives a ticket without a worktree, all items blocked', async () => {
    const project = await openProject(ctx, {
      slugBase: 'tc-archive',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
        {
          number: 'T-2',
          title: 'Beta',
          status: 'todo',
          folderName: 't-2-beta',
        },
      ],
      withWorktrees: [{ folderName: 't-2-beta' }],
    })
    const otherStatusPath = path.join(project.ticketsPath, 't-2-beta', 'status.json')
    const otherStatus = JSON.parse(fs.readFileSync(otherStatusPath, 'utf8'))
    fs.writeFileSync(otherStatusPath, JSON.stringify({
      ...otherStatus,
      agentWorktreeBranchName: 't-2-beta',
      agentWorktreeDir: path.join(project.worktreeRootPath!, 't-2-beta'),
    }))
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCleanup('archive')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-cancel').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    const otherTicket = testId(ctx.page, 'kanban-board-ticket-card').filter({ hasText: 'Beta' })
    await openTicketMenu(ctx.page, otherTicket.locator('[data-testid="kanban-board-ticket-menu-trigger"]'), 'ticket-actions-archive')
    await testId(ctx.page, 'ticket-actions-archive').evaluate((element) => (element as HTMLElement).click())
    await waitVisible(ctx.page, 'ticket-cleanup-submit')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-cancel').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await openCleanup('archive')
    await waitForChecksSettled(ctx.page)
    for (const id of [
      'ticket-cleanup-stop-herdr-button',
      'ticket-cleanup-delete-worktree-button',
      'ticket-cleanup-delete-local-button',
      'ticket-cleanup-delete-remote-button',
    ]) {
      const button = ctx.page.locator(`[data-testid="${id}"]`)
      expect(await button.isDisabled()).toBe(true)
    }
    const herdrStatus = testId(ctx.page, 'ticket-cleanup-stop-herdr-status')
    expect(await herdrStatus.getAttribute('data-state')).toBe('blocked')
    expect(await herdrStatus.textContent()).toContain('Herdr is not installed')
    await expect
      .poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').textContent(), {
        timeout: 15000,
      })
      .toContain('No worktree')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-submit').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes('t-1-alpha'),
      5000,
    )
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain('t-1-alpha')
    const archived = path.join(ctx.testServer.dataDir, 'projects', project.projectSlug, 'tickets', 'archive', 't-1-alpha')
    expect(fs.existsSync(archived)).toBe(true)
    await expect
      .poll(() => testId(ctx.page, 'kanban-board-ticket-card').count(), {
        timeout: 15000,
      })
      .toBe(1)
  })
  it('deletes a ticket without a worktree after cancel then submit', async () => {
    const project = await openProject(ctx, {
      slugBase: 'tc-delete',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    await openCleanup('delete')
    await testId(ctx.page, 'ticket-cleanup-cancel').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain('t-1-alpha')
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-submit').click()
    await testId(ctx.page, 'ticket-cleanup-confirm-cancel').click()
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain('t-1-alpha')
    await testId(ctx.page, 'ticket-cleanup-submit').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes('t-1-alpha'),
      5000,
    )
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain('t-1-alpha')
  })
  it('shows per-item check progress and enables possible items with a worktree', async () => {
    const project = await openProject(ctx, {
      slugBase: 'tc-progress',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    await openCleanup('delete')
    const statuses = ctx.page.locator('[data-testid^="ticket-cleanup-"][data-testid$="-status"]')
    expect(await statuses.count()).toBe(4)
    for (let i = 0; i < 4; i++) {
      expect(await statuses.nth(i).getAttribute('data-state')).not.toBeNull()
    }
    await waitForChecksSettled(ctx.page)
    expect(await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').isDisabled()).toBe(false)
    expect(await testId(ctx.page, 'ticket-cleanup-delete-local-button').isDisabled()).toBe(false)
    expect(await testId(ctx.page, 'ticket-cleanup-delete-remote-button').isDisabled()).toBe(true)
    const remoteButton = testId(ctx.page, 'ticket-cleanup-delete-remote-button')
    const remoteStatus = testId(ctx.page, 'ticket-cleanup-delete-remote-status')
    expect(await remoteStatus.textContent()).toContain('No remote branch')
    const [buttonBox, statusBox] = await Promise.all([remoteButton.boundingBox(), remoteStatus.boundingBox()])
    expect(buttonBox).not.toBeNull()
    expect(statusBox).not.toBeNull()
    expect(statusBox!.x).toBeGreaterThan(buttonBox!.x + buttonBox!.width)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm-cancel').click()
    expect(worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha')).toBe(true)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitForChecksSettled(ctx.page)
    await expect
      .poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').textContent(), {
        timeout: 15000,
      })
      .toContain('No worktree')
    expect(worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha')).toBe(false)
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-submit').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes('t-1-alpha'),
      5000,
    )
    expect(worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha')).toBe(false)
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain('t-1-alpha')
  })
  it('opens the cleanup dialog on archive when a worktree exists but useWorktree is false', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'tc-flag-false',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
    })
    const worktreeRoot = path.join(ctx.testServer.dataDir, 'projects', project.projectSlug, 'worktrees')
    const wtPath = path.join(worktreeRoot, 't-1-alpha')
    fs.mkdirSync(path.dirname(wtPath), {
      recursive: true,
    })
    git(`worktree add "${wtPath}" -b "t-1-alpha"`, project.projectPath)
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCleanup('archive')
    await waitForChecksSettled(ctx.page)
    expect(await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').isDisabled()).toBe(false)
    await testId(ctx.page, 'ticket-cleanup-cancel').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    expect(worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha')).toBe(true)
  })
  it('cleans up a worktree folder that is not a valid git repo', async () => {
    const project = await openProject(ctx, {
      slugBase: 'tc-notgit',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    ctx.projects.push(project)
    const wtPath = path.join(project.worktreeRootPath!, 't-1-alpha')
    fs.unlinkSync(path.join(wtPath, '.git'))
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitForChecksSettled(ctx.page)
    await expect
      .poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').textContent(), {
        timeout: 15000,
      })
      .toContain('No worktree')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-submit').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await poll(
      () => worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha'),
      (exists) => exists === false,
      5000,
    )
    expect(worktreeExists(ctx.testServer, project.projectSlug, 't-1-alpha')).toBe(false)
  })
  it('force deletes a branch with unmerged commits after cancel then confirm', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'tc-force-delete',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    const wtPath = path.join(project.worktreeRootPath!, 't-1-alpha')
    fs.writeFileSync(path.join(wtPath, 'unmerged.txt'), 'unmerged work')
    commitAll(wtPath, 'unmerged')
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitForChecksSettled(ctx.page)
    const localStatus = testId(ctx.page, 'ticket-cleanup-delete-local-status')
    await expect
      .poll(() => localStatus.textContent(), {
        timeout: 15000,
      })
      .toContain('Branch has unmerged commits')
    expect(branchExists(project.projectPath, 't-1-alpha')).toBe(true)
    await testId(ctx.page, 'ticket-cleanup-force-delete-branch').click()
    await testId(ctx.page, 'force-delete-branch-cancel').click()
    await waitGone(ctx.page, 'force-delete-branch-confirm')
    expect(branchExists(project.projectPath, 't-1-alpha')).toBe(true)
    await testId(ctx.page, 'ticket-cleanup-force-delete-branch').click()
    await testId(ctx.page, 'force-delete-branch-confirm').click()
    await expect
      .poll(() => localStatus.textContent(), {
        timeout: 15000,
      })
      .toContain('No local branch')
    expect(branchExists(project.projectPath, 't-1-alpha')).toBe(false)
  })
  it.skipIf(process.platform !== 'win32')('kills the process locking a worktree after cancel then confirm', async () => {
    const project = await seedProject(ctx, {
      slugBase: 'tc-kill',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    const wtPath = path.join(project.worktreeRootPath!, 't-1-alpha')
    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: wtPath,
      stdio: 'ignore',
    })
    const holderPid = holder.pid!
    setCommandTemplateOverride(ctx.testServer, 'agent-worktree.locking-processes.windows', `Write-Output "${holderPid}$([char]9)node"`)
    try {
      await gotoProject(ctx.page, ctx.testServer, project.projectSlug)
      await openCleanup('delete')
      await waitForChecksSettled(ctx.page)
      const worktreeStatus = testId(ctx.page, 'ticket-cleanup-delete-worktree-status')
      expect(await worktreeStatus.textContent()).toContain('in use by another process')
      await testId(ctx.page, 'ticket-cleanup-kill-processes').click()
      await waitVisible(ctx.page, 'kill-processes-confirm')
      expect(await ctx.page.getByText(`PID ${holderPid}`).count()).toBe(1)
      await testId(ctx.page, 'kill-processes-cancel').click()
      await waitGone(ctx.page, 'kill-processes-confirm')
      expect(processAlive(holderPid)).toBe(true)
      await testId(ctx.page, 'ticket-cleanup-kill-processes').click()
      await testId(ctx.page, 'kill-processes-confirm').click()
      await poll(
        () => processAlive(holderPid),
        (alive) => alive === false,
        15000,
      )
      expect(processAlive(holderPid)).toBe(false)
    } finally {
      if (processAlive(holderPid)) holder.kill()
    }
  })
  it('keeps completed cleanup status when the dialog is reopened', async () => {
    await openProject(ctx, {
      slugBase: 'tc-autotick',
      withTickets: [
        {
          number: 'T-1',
          title: 'Alpha',
          status: 'todo',
          folderName: 't-1-alpha',
        },
      ],
      withWorktrees: [
        {
          folderName: 't-1-alpha',
        },
      ],
    })
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').click()
    await testId(ctx.page, 'ticket-cleanup-confirm').click()
    await waitForChecksSettled(ctx.page)
    await expect
      .poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').textContent(), {
        timeout: 15000,
      })
      .toContain('No worktree')
    await testId(ctx.page, 'ticket-cleanup-cancel').click()
    await waitGone(ctx.page, 'ticket-cleanup-submit')
    await openCleanup('delete')
    await waitForChecksSettled(ctx.page)
    expect(await testId(ctx.page, 'ticket-cleanup-delete-worktree-button').isDisabled()).toBe(true)
    await expect
      .poll(() => testId(ctx.page, 'ticket-cleanup-delete-worktree-status').textContent(), {
        timeout: 15000,
      })
      .toContain('No worktree')
  })
})
