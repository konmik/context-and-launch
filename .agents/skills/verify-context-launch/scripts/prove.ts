import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { capture, readRegistry, readTaskWorktree, runVerification } from './harness.js'

await runVerification(async (session) => {
  const { page, projectPath, evidenceDir } = session
  await page.goto(`${session.server.baseUrl}/add-project`)
  await page.getByTestId('add-project-path-input').fill(projectPath)
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-testid="add-project-main-branch-input"]')?.value === 'main')
  await page.getByTestId('add-project-branch-input').fill('verification-tasks')
  await capture(session, 'registration-before-submit')
  await page.getByTestId('add-project-submit').click()
  await page.getByTestId('project-header-settings-button').waitFor({ state: 'visible' })
  const registry = readRegistry(session)
  assert.equal(registry.projects.length, 1)
  const project = registry.projects[0]
  assert.equal(project.mainBranch, 'main')
  assert.equal(project.branch, 'verification-tasks')
  const tasksPath = readTaskWorktree(session, 'verification-tasks')
  const branches = execFileSync('git', ['branch', '--list'], { cwd: projectPath, encoding: 'utf8' })
  assert.ok(branches.includes('verification-tasks'))
  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: projectPath, encoding: 'utf8' })
  await capture(session, 'registration-after-submit')
  await page.getByTestId('project-header-new-task-button').click()
  await page.getByTestId('create-task-number-input').fill('VERIFY-0001')
  await page.getByTestId('create-task-title-input').fill('Verification evidence')
  await capture(session, 'task-before-submit')
  await page.getByTestId('create-task-submit').click()
  const card = page.getByTestId('kanban-board-task-card').filter({ hasText: 'VERIFY-0001' })
  await card.waitFor({ state: 'visible' })
  const taskFolders = fs.readdirSync(tasksPath).filter((name) => fs.existsSync(path.join(tasksPath, name, 'status.json')))
  assert.equal(taskFolders.length, 1)
  const status = JSON.parse(fs.readFileSync(path.join(tasksPath, taskFolders[0], 'status.json'), 'utf8'))
  assert.equal(status.number, 'VERIFY-0001')
  assert.equal(status.title, 'Verification evidence')
  fs.writeFileSync(path.join(evidenceDir, 'side-effects.json'), JSON.stringify({ registry, branches, worktrees, tasksPath, taskFolders, status }, undefined, 2))
  await page.reload()
  await card.waitFor({ state: 'visible' })
  await capture(session, 'task-after-reload')
  fs.writeFileSync(path.join(evidenceDir, 'proof.json'), JSON.stringify({
    verified: ['projects.register/direct-route', 'projects.custom-branch', 'tasks.create/header-button', 'tasks.persist/reload'],
    skipped: ['projects.menu-entry', 'projects.register/default-branch', 'tasks.cancel', 'tasks.regenerate', 'editor', 'launcher'],
    externalBoundaries: ['Herdr unavailable stub', 'OS open no-op', 'native picker cancel'],
  }, undefined, 2))
})
