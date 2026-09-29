import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import * as v from 'valibot'

const FetchHandlerSchema = v.object({ fetch: v.function() })

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

async function readStaticResponse(request, clientRoot, pathname) {
  let relative
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, '')
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const root = path.resolve(clientRoot)
  const candidate = path.resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return new Response('Not found', { status: 404 })
  }
  try {
    if (!(await stat(candidate)).isFile()) return undefined
    const body = request.method === 'HEAD' ? null : await readFile(candidate)
    return new Response(body, {
      headers: { 'content-type': mimeTypes.get(path.extname(candidate)) ?? 'application/octet-stream' },
    })
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return undefined
    throw error
  }
}

export function createBuiltAppHandler(serverHandler, clientRoot) {
  if (!v.safeParse(FetchHandlerSchema, serverHandler).success) {
    throw new Error('The built server module does not export a fetch handler.')
  }
  return async function handleRequest(request) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/_server' || pathname.startsWith('/_server/') || pathname.startsWith('/api/')) {
      return serverHandler.fetch(request)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return serverHandler.fetch(request)
    const asset = await readStaticResponse(request, clientRoot, pathname)
    if (asset) return asset
    return (await readStaticResponse(request, clientRoot, '/index.html')) ?? new Response('Not found', { status: 404 })
  }
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined
}

async function writeResponse(response, nodeResponse) {
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) return void nodeResponse.end()
  const reader = response.body.getReader()
  const cancel = () => {
    void reader.cancel().catch((error) => console.error('Response cancellation failed:', error))
  }
  nodeResponse.once('close', cancel)
  try {
    if (nodeResponse.destroyed || nodeResponse.req.method === 'HEAD') {
      await reader.cancel()
      if (!nodeResponse.destroyed) nodeResponse.end()
      return
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done || nodeResponse.destroyed) break
      nodeResponse.write(value)
    }
    if (!nodeResponse.destroyed) nodeResponse.end()
  } finally {
    nodeResponse.off('close', cancel)
    reader.releaseLock()
  }
}

export function createNodeRequestHandler(handleRequest) {
  return async function handleNodeRequest(request, response) {
    const controller = new AbortController()
    response.once('close', () => {
      if (!response.writableEnded) controller.abort()
    })
    try {
      const origin = `http://${request.headers.host}`
      const webRequest = new Request(new URL(request.url, origin), {
        method: request.method,
        headers: request.headers,
        body: await readRequestBody(request),
        signal: controller.signal,
      })
      await writeResponse(await handleRequest(webRequest), response)
    } catch (error) {
      console.error(error)
      if (!response.headersSent) {
        response.setHeader('content-type', 'text/plain; charset=utf-8')
        response.writeHead(500)
      }
      response.end('Internal server error')
    }
  }
}
