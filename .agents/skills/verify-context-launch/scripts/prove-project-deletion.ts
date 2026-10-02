import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { capture, readRegistry, readTaskWorktree, runVerification } from './harness.js'

await runVerification(async (session) => {
  const { page, projectPath, evidenceDir } = session
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${session.server.baseUrl}/add-project`)
  await page.getByTestId('add-project-name-input').fill('Deletion Project')
  await page.getByTestId('add-project-path-input').fill(projectPath)
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-testid="add-project-main-branch-input"]')?.value === 'main')
  await page.getByTestId('add-project-branch-input').fill('verification-tasks')
  await page.getByTestId('add-project-submit').click()
  await page.getByTestId('project-header-settings-button').waitFor({ state: 'visible' })
  const registered = readRegistry(session)
  assert.equal(registered.projects.length, 1)
  const tasksPath = readTaskWorktree(session, 'verification-tasks')
  await page.getByTestId('project-header-settings-button').click()
  await page.getByTestId('launcher-settings-tab-misc').click()
  await page.getByTestId('launcher-settings-delete-project').click()
  await capture(session, 'project-deletion-before-submit')
  await page.getByTestId('delete-project-submit').click()
  await page.waitForURL('**/add-project')
  await page.getByTestId('add-project-path-input').waitFor({ state: 'visible' })
  await capture(session, 'project-deletion-after-submit')
  await page.reload()
  await page.getByTestId('add-project-path-input').waitFor({ state: 'visible' })
  await capture(session, 'project-deletion-after-reload')
  const registry = readRegistry(session)
  assert.deepEqual(registry.projects, [])
  assert.equal(registry.lastUsedProjectSlug, null)
  assert.ok(fs.existsSync(projectPath))
  assert.ok(fs.existsSync(tasksPath))
  const logDir = path.join(session.dataDir, 'logs')
  const logs = fs.readdirSync(logDir).map((file) => fs.readFileSync(path.join(logDir, file), 'utf8')).join('\n')
  fs.writeFileSync(path.join(evidenceDir, 'app.log'), logs)
  assert.ok(!logs.includes('[server-function-error]'))
  assert.deepEqual(pageErrors, [])
  fs.writeFileSync(path.join(evidenceDir, 'side-effects.json'), JSON.stringify({ registered, registry, projectPath, tasksPath, pageErrors }, undefined, 2))
  fs.writeFileSync(path.join(evidenceDir, 'proof.json'), JSON.stringify({
    verified: ['projects.register/direct-route', 'projects.delete-last/settings', 'projects.delete-last/reload', 'projects.delete-last/files-preserved', 'projects.delete-last/no-server-errors'],
    skipped: ['projects.delete/remaining-project-navigation', 'Electron-native-hang-and-crash', 'tasks', 'editor', 'launcher'],
    externalBoundaries: ['Herdr unavailable stub', 'OS open no-op', 'native picker cancel'],
  }, undefined, 2))
})
