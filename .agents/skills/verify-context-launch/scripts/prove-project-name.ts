import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { capture, readRegistry, runVerification } from './harness.js'

await runVerification(async (session) => {
  const { page, projectPath, evidenceDir } = session
  await page.goto(`${session.server.baseUrl}/add-project`)
  await page.getByTestId('add-project-name-input').fill('Named Project')
  await page.getByTestId('add-project-path-input').fill(projectPath)
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-testid="add-project-main-branch-input"]')?.value === 'main')
  await capture(session, 'project-name-before-submit')
  await page.getByTestId('add-project-submit').click()
  await page.getByTestId('project-header-settings-button').waitFor({ state: 'visible' })
  assert.equal(readRegistry(session).projects[0].name, 'Named Project')
  assert.equal(await page.title(), 'Named Project - Context & Launch')
  await page.getByTestId('project-header-settings-button').click()
  await page.getByTestId('launcher-settings-tab-misc').click()
  const nameInput = page.getByTestId('launcher-settings-misc-project-name-input')
  await nameInput.waitFor({ state: 'visible' })
  assert.equal(await nameInput.inputValue(), 'Named Project')
  await capture(session, 'project-name-after-submit')
  await nameInput.focus()
  const saved = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/_server'))
  await nameInput.press('Tab')
  await saved
  await page.getByTestId('launcher-settings-close-button').click()
  await page.reload()
  await page.getByTestId('project-header-settings-button').waitFor({ state: 'visible' })
  await page.getByTestId('project-header-settings-button').click()
  await page.getByTestId('launcher-settings-tab-misc').click()
  await nameInput.waitFor({ state: 'visible' })
  assert.equal(await nameInput.inputValue(), 'Named Project')
  const registry = readRegistry(session)
  assert.equal(registry.projects[0].name, 'Named Project')
  await capture(session, 'project-name-after-reload')
  fs.writeFileSync(path.join(evidenceDir, 'side-effects.json'), JSON.stringify({ registry }, undefined, 2))
  fs.writeFileSync(path.join(evidenceDir, 'proof.json'), JSON.stringify({
    verified: ['projects.register/direct-route', 'projects.name/settings-before-reload', 'projects.name/unchanged-blur', 'projects.name/reload'],
    skipped: ['projects.menu-entry', 'projects.register/default-name', 'tasks', 'editor', 'launcher', 'Electron-native'],
    externalBoundaries: ['Herdr unavailable stub', 'OS open no-op', 'native picker cancel'],
  }, undefined, 2))
})
