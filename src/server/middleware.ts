import 'server-only'
import { appLog } from '../core/infra/app-logger.js'
import { handleRawRoute } from './raw-routes.js'

export default async function middleware(request: Request, next: () => Response | Promise<Response>): Promise<Response> {
  const pathname = new URL(request.url).pathname
  if (pathname !== '/_server') appLog('http', `${request.method} ${pathname}`)
  const response = (await handleRawRoute(request)) ?? (await next())
  if (response.status >= 500) {
    appLog('http-error', `${request.method} ${pathname}`, {
      status: response.status,
      functionId: new URL(request.url).searchParams.get('id') ?? undefined,
    })
  }
  return response
}
