import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { errorMessage } from '../../../src/core/shared/errors.js'
import { createTaskStore } from '../../../src/core/task/task-store.js'

/**
 * Tests that non-JSON request bodies to the context PUT endpoint produce
 * safe 400 responses without leaking stack traces or file paths.
 *
 * The PUT handler does: await request.json()
 * For non-JSON bodies this throws a SyntaxError. The route catches it
 * and returns: new Response(errorMessage(e), { status: 400 })
 *
 * We test errorMessage with the actual SyntaxError that Request.json() throws
 * for various invalid bodies to confirm no internal info leaks.
 */
describe('PUT /context/:name non-JSON body handling', () => {
  async function getJsonParseError(body: BodyInit): Promise<Error> {
    const request = new Request('http://localhost/test', {
      method: 'PUT',
      body,
    })
    try {
      await request.json()
      throw new Error('Expected json() to throw')
    } catch (e) {
      if (e instanceof Error) return e
      throw new Error('Expected json() to throw an Error.')
    }
  }

  it.concurrent('plain text body: error message has no stack trace or file paths', async () => {
    const err = await getJsonParseError('this is not json')
    const msg = errorMessage(err)
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('\\')
    expect(msg).not.toContain('/src/')
    expect(msg).not.toContain('node_modules')
    expect(msg).not.toContain('at ')
    expect(msg).not.toContain('.ts:')
    expect(msg).not.toContain('.js:')
  })
  it.concurrent('empty string body: error message is safe', async () => {
    const err = await getJsonParseError('')
    const msg = errorMessage(err)
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('\\')
    expect(msg).not.toContain('/src/')
    expect(msg).not.toContain('node_modules')
    expect(msg).not.toContain('at ')
  })
  it.concurrent('binary-like body: error message is safe', async () => {
    const binary = new Uint8Array([0, 1, 255, 254])
    const err = await getJsonParseError(binary)
    const msg = errorMessage(err)
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('\\')
    expect(msg).not.toContain('/src/')
    expect(msg).not.toContain('node_modules')
    expect(msg).not.toContain('at ')
  })
  it.concurrent('HTML body: error message is safe', async () => {
    const err = await getJsonParseError('<html><body>hi</body></html>')
    const msg = errorMessage(err)
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('\\')
    expect(msg).not.toContain('/src/')
    expect(msg).not.toContain('at ')
  })
})

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

async function createGitWorktree(): Promise<string> {
  return tmpDir('context-traversal-test-')
}

describe('GET/DELETE with path-traversal name param', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) {
      try {
        fs.rmSync(d, {
          recursive: true,
          force: true,
        })
      } catch (e) {
        console.warn('cleanup failed', e)
      }
    }
    dirs.length = 0
  })
  const traversalNames = ['../secret', '..\\secret', 'foo/../../bar', '..', '.']
  for (const badName of traversalNames) {
    it.concurrent(`getTaskContext rejects name="${badName}"`, async () => {
      const worktreeDir = await createGitWorktree()
      dirs.push(worktreeDir)
      const store = createTaskStore(worktreeDir)
      store.createTask('T-1', 'Test Task')
      expect(() => store.getTaskContext('t-1-test-task', badName)).toThrow()
    })
    it.concurrent(`getTaskContext error for name="${badName}" is user-safe`, async () => {
      const worktreeDir = await createGitWorktree()
      dirs.push(worktreeDir)
      const store = createTaskStore(worktreeDir)
      store.createTask('T-1', 'Test Task')
      let msg = ''
      try {
        store.getTaskContext('t-1-test-task', badName)
      } catch (e) {
        msg = errorMessage(e)
      }
      expect(msg).toBeTruthy()
      expect(msg).not.toContain('node_modules')
      expect(msg).not.toMatch(/at\s+\w+\s+\(/)
      expect(msg).not.toContain('.ts:')
    })
    it.concurrent(`deleteTaskContext rejects name="${badName}"`, async () => {
      const worktreeDir = await createGitWorktree()
      dirs.push(worktreeDir)
      const store = createTaskStore(worktreeDir)
      store.createTask('T-1', 'Test Task')
      expect(() => store.deleteTaskContext('t-1-test-task', badName)).toThrow()
    })
    it.concurrent(`deleteTaskContext error for name="${badName}" is user-safe`, async () => {
      const worktreeDir = await createGitWorktree()
      dirs.push(worktreeDir)
      const store = createTaskStore(worktreeDir)
      store.createTask('T-1', 'Test Task')
      let msg = ''
      try {
        store.deleteTaskContext('t-1-test-task', badName)
      } catch (e) {
        msg = errorMessage(e)
      }
      expect(msg).toBeTruthy()
      expect(msg).not.toContain('node_modules')
      expect(msg).not.toMatch(/at\s+\w+\s+\(/)
      expect(msg).not.toContain('.ts:')
    })
  }
})
