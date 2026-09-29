import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchProjectView } from '../../../src/components/project/project-watch.js'

const releases: Array<() => void> = []

afterEach(() => {
  for (const release of releases.splice(0)) release()
  vi.restoreAllMocks()
})
describe('project view watch connection', () => {
  it('aborts the previous project connection when switching projects', () => {
    const signals: AbortSignal[] = []
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) => {
      signals.push(options!.signal!)
      return new Promise<Response>(() => {})
    })
    const onError = vi.fn()
    const releaseFirst = watchProjectView('first project', onError)
    releases.push(releaseFirst)
    releaseFirst()
    releases.push(watchProjectView('second', onError))
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/projects/first%20project/watch', '/api/projects/second/watch'])
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(onError).not.toHaveBeenCalled()
  })
  it('releases on page exit and reconnects after restoring the page', () => {
    const signals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) => {
      signals.push(options!.signal!)
      return new Promise<Response>(() => {})
    })
    const release = watchProjectView('example', vi.fn())
    releases.push(release)
    window.dispatchEvent(new Event('pagehide'))
    expect(signals[0].aborted).toBe(true)
    window.dispatchEvent(new Event('pageshow'))
    expect(signals).toHaveLength(2)
    expect(signals[1].aborted).toBe(false)
    release()
    window.dispatchEvent(new Event('pageshow'))
    expect(signals).toHaveLength(2)
    expect(signals[1].aborted).toBe(true)
  })
  it('reports connection failures instead of silently leaving the project unwatched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Project unavailable', {
        status: 500,
      }),
    )
    let report!: (cause: unknown) => void
    const reported = new Promise<unknown>((resolve) => {
      report = resolve
    })
    releases.push(watchProjectView('example', report))
    expect(await reported).toEqual(new Error('Project watcher request failed: Project unavailable'))
  })
})
