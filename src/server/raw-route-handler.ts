import { getMimeType } from '../core/shared/mime-types.js'
import { errorPayload } from '../core/shared/errors.js'

const taskFilePathPattern = /^\/api\/projects\/([^/]+)\/board\/tasks\/([^/]+)\/files\/([^/]+)$/

const taskReferenceContentPathPattern = /^\/api\/projects\/([^/]+)\/board\/tasks\/([^/]+)\/references\/content$/

const projectWatchPathPattern = /^\/api\/projects\/([^/]+)\/watch$/

export interface RawRouteStore {
  getFileContent: (folderName: string, fileName: string) => Buffer
  getReferencedFileContent: (folderName: string, refPath: string) => Buffer
}

export interface RawRouteDeps {
  getWorktreeDir: (projectSlug: string) => string
  createTaskStore: (worktreeDir: string) => RawRouteStore
  subscribeProject: (projectSlug: string) => () => Promise<void>
}

function projectWatchResponse(request: Request, subscribe: () => () => Promise<void>): Response {
  request.signal.throwIfAborted()
  const unsubscribe = subscribe()
  let releasePromise: Promise<void> | undefined
  let abort: () => void

  function release(): Promise<void> {
    request.signal.removeEventListener('abort', abort)
    return (releasePromise ??= unsubscribe())
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        controller.close()
        void release().catch((error: unknown) => console.error('Project watcher release failed:', error))
      }
      request.signal.addEventListener('abort', abort, {
        once: true,
      })
      controller.enqueue(new TextEncoder().encode('watching\n'))
    },
    cancel: release,
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
    },
  })
}

export function createRawRouteHandler(deps: RawRouteDeps): (request: Request) => Promise<Response | undefined> {
  return async function handleRawRoute(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
    const watchMatch = url.pathname.match(projectWatchPathPattern)
    if (watchMatch) {
      if (request.method !== 'GET')
        return new Response('Method not allowed', {
          status: 405,
        })
      try {
        return projectWatchResponse(request, () => deps.subscribeProject(decodeURIComponent(watchMatch[1])))
      } catch (error) {
        return Response.json(errorPayload(error, 'Watch project failed'), {
          status: 500,
        })
      }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
    const fileMatch = url.pathname.match(taskFilePathPattern)
    const referenceMatch = url.pathname.match(taskReferenceContentPathPattern)
    if (!fileMatch && !referenceMatch) return undefined
    try {
      const [, projectSlug, folderName, encodedFileName] = fileMatch ?? referenceMatch!
      const store = deps.createTaskStore(deps.getWorktreeDir(decodeURIComponent(projectSlug)))
      let content: Buffer
      let fileName: string
      if (fileMatch) {
        fileName = decodeURIComponent(encodedFileName)
        content = store.getFileContent(decodeURIComponent(folderName), fileName)
      } else {
        const refPath = url.searchParams.get('path')
        if (!refPath)
          return Response.json(
            {
              title: 'Load file failed',
              description: 'Missing path parameter',
              field: 'path',
            },
            {
              status: 400,
            },
          )
        fileName = refPath
        content = store.getReferencedFileContent(decodeURIComponent(folderName), refPath)
      }
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(content), {
        headers: {
          'Content-Type': getMimeType(fileName) ?? 'application/octet-stream',
        },
      })
    } catch (error) {
      return Response.json(errorPayload(error, 'Load file failed'), {
        status: 500,
      })
    }
  }
}
