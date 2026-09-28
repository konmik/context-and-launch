import 'server-only'
import { inspect } from 'node:util'
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server'
import { createFlightDataCollector } from '@solidjs/router/server'
import { AppRouter } from './router.js'
import { publishAppServices } from './server/app-services.js'
import { appLog } from './core/infra/app-logger.js'

publishAppServices()
configureServerFunctionsServer({
  collectFlightData: createFlightDataCollector(AppRouter),
  wrapInvocation(run, context): unknown {
    const reportError = (cause: unknown): never => {
      appLog('server-function-error', inspect(cause), {
        functionId: context.id,
        direct: context.direct,
        method: context.request?.method,
        pathname: context.request && new URL(context.request.url).pathname,
      })
      throw cause
    }
    try {
      const result = run()
      return result instanceof Promise ? result.catch(reportError) : result
    } catch (cause) {
      return reportError(cause)
    }
  },
})
