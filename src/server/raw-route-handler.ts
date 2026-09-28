import { getMimeType } from '../core/shared/mime-types.js'
import { errorPayload } from '../core/shared/errors.js'

const taskFilePathPattern = /^\/api\/projects\/([^/]+)\/board\/tasks\/([^/]+)\/files\/([^/]+)$/

const taskReferenceContentPathPattern = /^\/api\/projects\/([^/]+)\/board\/tasks\/([^/]+)\/references\/content$/

export interface RawRouteStore {
  getFileContent: (folderName: string, fileName: string) => Buffer
  getReferencedFileContent: (folderName: string, refPath: string) => Buffer
}

export interface RawRouteDeps {
  getWorktreeDir: (projectSlug: string) => string
  createTaskStore: (worktreeDir: string) => RawRouteStore
}

export function createRawRouteHandler(deps: RawRouteDeps): (request: Request) => Promise<Response | undefined> {
  return async function handleRawRoute(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
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
