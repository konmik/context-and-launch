import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRawRouteHandler } from '../../src/server/raw-route-handler.js'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createNodeRequestHandler } from '../../scripts/built-app.mjs'

const mocks = {
  getFileContent: vi.fn(),
  getReferencedFileContent: vi.fn(),
  getWorktreeDir: vi.fn(() => 'C:/worktree'),
  unsubscribe: vi.fn(async () => {}),
  subscribeProject: vi.fn<() => () => Promise<void>>(),
}

const handleRawRoute = createRawRouteHandler({
  getWorktreeDir: mocks.getWorktreeDir,
  createTaskStore: () => ({
    getFileContent: mocks.getFileContent,
    getReferencedFileContent: mocks.getReferencedFileContent,
  }),
  subscribeProject: mocks.subscribeProject,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWorktreeDir.mockReturnValue('C:/worktree')
  mocks.getFileContent.mockReturnValue(Buffer.from('file body'))
  mocks.getReferencedFileContent.mockReturnValue(Buffer.from('reference body'))
  mocks.subscribeProject.mockReturnValue(mocks.unsubscribe)
})
describe('raw content routes', () => {
  it('releases the watcher when a real HTTP client disconnects', async () => {
    let resolveReleased!: () => void
    const released = new Promise<void>((resolve) => {
      resolveReleased = resolve
    })
    mocks.unsubscribe.mockImplementationOnce(async () => resolveReleased())
    const server = createServer(createNodeRequestHandler(async (request: Request) => (await handleRawRoute(request))!))
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not bind a TCP port')
    const controller = new AbortController()
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/example/watch`, {
        signal: controller.signal,
      })
      const reader = response.body!.getReader()
      await reader.read()
      controller.abort()
      await released
      expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    } finally {
      controller.abort()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
  it('owns a project watch only for the lifetime of its response stream', async () => {
    const response = await handleRawRoute(new Request('http://app/api/projects/my%20project/watch'))
    expect(mocks.subscribeProject).toHaveBeenCalledWith('my project')
    const reader = response!.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('watching\n')
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    await reader.cancel()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
  it('releases a disconnected view and settles its pending stream read', async () => {
    const controller = new AbortController()
    const response = await handleRawRoute(
      new Request('http://app/api/projects/example/watch', {
        signal: controller.signal,
      }),
    )
    const reader = response!.body!.getReader()
    await reader.read()
    const pending = reader.read()
    controller.abort()
    expect((await pending).done).toBe(true)
    await reader.cancel()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
  it('does not acquire watchers for HEAD requests or already-disconnected views', async () => {
    const head = await handleRawRoute(
      new Request('http://app/api/projects/example/watch', {
        method: 'HEAD',
      }),
    )
    expect(head?.status).toBe(405)
    const controller = new AbortController()
    controller.abort()
    await handleRawRoute(
      new Request('http://app/api/projects/example/watch', {
        signal: controller.signal,
      }),
    )
    expect(mocks.subscribeProject).not.toHaveBeenCalled()
  })
  it('surfaces project watch acquisition errors', async () => {
    mocks.subscribeProject.mockImplementationOnce(() => {
      throw new Error('Project unavailable')
    })
    const response = await handleRawRoute(new Request('http://app/api/projects/example/watch'))
    expect(response?.status).toBe(500)
    expect(await response?.json()).toEqual({
      title: 'Watch project failed',
      description: 'Project unavailable',
    })
  })
  it('decodes route parameters and returns file content', async () => {
    const response = await handleRawRoute(new Request('http://app/api/projects/my%20project/board/tasks/ST-1-title/files/notes%20one.md'))
    expect(await response?.text()).toBe('file body')
    expect(response?.headers.get('content-type')).toContain('text/plain')
    expect(mocks.getWorktreeDir).toHaveBeenCalledWith('my project')
    expect(mocks.getFileContent).toHaveBeenCalledWith('ST-1-title', 'notes one.md')
  })
  it('returns reference content and omits the body for HEAD', async () => {
    const response = await handleRawRoute(
      new Request('http://app/api/projects/example/board/tasks/ST-1/references/content?path=docs%2Fguide.md', {
        method: 'HEAD',
      }),
    )
    expect(await response?.text()).toBe('')
    expect(mocks.getReferencedFileContent).toHaveBeenCalledWith('ST-1', 'docs/guide.md')
  })
  it('validates the reference path and delegates unsupported requests', async () => {
    const missing = await handleRawRoute(new Request('http://app/api/projects/example/board/tasks/ST-1/references/content'))
    expect(missing?.status).toBe(400)
    expect(await handleRawRoute(new Request('http://app/other'))).toBeUndefined()
    expect(
      await handleRawRoute(
        new Request('http://app/api/projects/example/board/tasks/ST-1/references/content', {
          method: 'POST',
        }),
      ),
    ).toBeUndefined()
  })
  it('preserves endpoint error responses', async () => {
    mocks.getFileContent.mockImplementation(() => {
      throw new Error('read failed')
    })
    const response = await handleRawRoute(new Request('http://app/api/projects/example/board/tasks/ST-1/files/a.txt'))
    expect(response?.status).toBe(500)
    await expect(response?.json()).resolves.toEqual({
      title: 'Load file failed',
      description: 'read failed',
    })
  })
})
