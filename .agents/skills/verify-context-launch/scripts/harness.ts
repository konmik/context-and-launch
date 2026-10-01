import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { startRealServer, stopRealServer, type RealServer } from '../../../../tests/e2e/real-server.js'
import { pickPort } from '../../../../tests/e2e/test-port.js'
import { removeTempDir } from '../../../../tests/test-temp.js'
import commandDefaults from '../../../../config-defaults/command-templates.json'
import type { AppConfigData } from '../../../../src/core/config/app-config-data.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

export interface VerificationSession {
  page: Page
  server: RealServer
  scratchDir: string
  dataDir: string
  projectPath: string
  evidenceDir: string
}

export function readRegistry(session: VerificationSession): AppConfigData {
  return JSON.parse(fs.readFileSync(path.join(session.dataDir, 'config/config.json'), 'utf8'))
}

export function readTaskWorktree(session: VerificationSession, taskBranch: string): string {
  const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: session.projectPath, encoding: 'utf8' })
  const entry = listing.split(/\r?\n\r?\n/).find((block) => block.split(/\r?\n/).includes(`branch refs/heads/${taskBranch}`))
  assert.ok(entry, `No task worktree for ${taskBranch}: ${listing}`)
  const worktreeLine = entry.split(/\r?\n/).find((line) => line.startsWith('worktree '))
  assert.ok(worktreeLine, `Task worktree path missing: ${entry}`)
  const tasksPath = path.resolve(worktreeLine.slice('worktree '.length))
  assert.ok(tasksPath.startsWith(path.resolve(session.scratchDir) + path.sep), `Task worktree is outside owned scratch state: ${tasksPath}`)
  return tasksPath
}

export async function doctor(session: VerificationSession): Promise<void> {
  assert.equal(session.server.process.exitCode, null)
  assert.equal(session.server.process.signalCode, null)
  assert.ok(session.server.process.pid)
  process.kill(session.server.process.pid, 0)
  assert.ok(session.server.process.spawnargs.includes(path.join(root, 'node_modules/vite/bin/vite.js')))
  const response = await fetch(`${session.server.baseUrl}/add-project`, { headers: { Accept: 'text/html' } })
  assert.equal(response.status, 200)
  const html = await response.text()
  fs.writeFileSync(path.join(session.evidenceDir, 'doctor-response.txt'), html)
  assert.ok(html.includes('id="app"'))
  assert.ok(html.includes('entry-client.tsx'))
  fs.writeFileSync(path.join(session.evidenceDir, 'doctor.json'), JSON.stringify({
    pid: session.server.process.pid,
    baseUrl: session.server.baseUrl,
    dataDir: session.dataDir,
    projectPath: session.projectPath,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
  }, undefined, 2))
}

export async function capture(session: VerificationSession, artifactName: string): Promise<void> {
  assert.match(artifactName, /^[a-z0-9-]+$/)
  await session.page.screenshot({ path: path.join(session.evidenceDir, `${artifactName}.png`), fullPage: true })
  fs.writeFileSync(path.join(session.evidenceDir, `${artifactName}.aria.txt`), await session.page.locator('body').ariaSnapshot())
}

export async function runVerification(drive: (session: VerificationSession) => Promise<void>): Promise<void> {
  const localData = process.env.LOCALAPPDATA
  if (!localData) throw new Error('LOCALAPPDATA is required for this Windows verification harness')
  const scratchParent = path.join(localData, 'Temp/opencode')
  fs.mkdirSync(scratchParent, { recursive: true })
  const scratchDir = fs.mkdtempSync(path.join(scratchParent, 'verify-'))
  const evidenceParent = path.join(root, 'temp/verification')
  fs.mkdirSync(evidenceParent, { recursive: true })
  const evidenceDir = fs.mkdtempSync(path.join(evidenceParent, 'run-'))
  console.log(`Evidence: ${evidenceDir}`)
  const dataDir = path.join(scratchDir, 'data')
  const projectPath = path.join(scratchDir, 'verification-project')
  let server: RealServer | undefined
  let browser: Browser | undefined
  const errors: unknown[] = []
  try {
    fs.mkdirSync(path.join(dataDir, 'config'), { recursive: true })
    fs.mkdirSync(projectPath)
    const blockedCommands = Object.fromEntries(Object.keys(commandDefaults)
      .filter((key) => key.startsWith('herdr.'))
      .map((key) => [key, 'herdr-e2e-not-installed status server']))
    fs.writeFileSync(path.join(dataDir, 'config/command-templates.json'), JSON.stringify(blockedCommands))
    fs.writeFileSync(path.join(dataDir, 'config/launcher-config.json'), JSON.stringify({
      templates: [{ name: 'Verification', text: 'Inspect {{taskDir}}\n{{skills}}' }],
      skills: [{ name: 'verification-skill', text: 'Keep all changes inside this scratch project.' }],
      profiles: [],
      shortcuts: [],
    }))
    execFileSync('git', ['init', '-b', 'main'], { cwd: projectPath })
    execFileSync('git', ['-c', 'user.name=Verification', '-c', 'user.email=verification@example.invalid', 'commit', '--allow-empty', '-m', 'init'], { cwd: projectPath })
    server = await startRealServer(pickPort(), dataDir, {
      CONTEXT_PICKER_STUB: '__cancel__',
      CONTEXT_FILE_PICKER_STUB: '__cancel__',
      CONTEXT_OPEN_IN_OS_STUB: '__noop__',
      GIT_AUTHOR_NAME: 'Verification',
      GIT_AUTHOR_EMAIL: 'verification@example.invalid',
      GIT_COMMITTER_NAME: 'Verification',
      GIT_COMMITTER_EMAIL: 'verification@example.invalid',
    }, 'development')
    fs.appendFileSync(path.join(evidenceDir, 'server.log'), `Ready: ${server.baseUrl}, PID ${server.process.pid}\n`)
    server.process.stdout.on('data', (chunk: Buffer) => fs.appendFileSync(path.join(evidenceDir, 'server.log'), chunk))
    server.process.stderr.on('data', (chunk: Buffer) => fs.appendFileSync(path.join(evidenceDir, 'server.log'), chunk))
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const session: VerificationSession = { page, server, scratchDir, dataDir, projectPath, evidenceDir }
    try {
      await doctor(session)
      await drive(session)
    } finally {
      await context.tracing.stop({ path: path.join(evidenceDir, 'trace.zip') })
    }
  } catch (error) {
    errors.push(error)
    fs.writeFileSync(path.join(evidenceDir, 'failure.txt'), String(error))
  } finally {
    for (const cleanup of [
      async () => { if (browser) await browser.close() },
      async () => { if (server) await stopRealServer(server) },
    ]) {
      try { await cleanup() } catch (error) { errors.push(error) }
    }
    if (!server || server.process.exitCode !== null || server.process.signalCode !== null) {
      try { await removeTempDir(scratchDir) } catch (error) { errors.push(error) }
    } else {
      errors.push(new Error(`Server is still running; scratch state retained at ${scratchDir}`))
    }
    fs.writeFileSync(path.join(evidenceDir, 'cleanup.json'), JSON.stringify({
      scratchDir,
      scratchRemoved: !fs.existsSync(scratchDir),
      serverExited: !server || server.process.exitCode !== null || server.process.signalCode !== null,
      errors: errors.map(String),
    }, undefined, 2))
    assert.ok(fs.existsSync(evidenceDir))
  }
  if (errors.length) throw new AggregateError(errors, `Verification failed; evidence retained at ${evidenceDir}`)
}
