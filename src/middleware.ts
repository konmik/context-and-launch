import { createMiddleware } from "@solidjs/start/middleware";
import { initializeServices } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";

initializeServices();

function extractFnName(meta: { id: string }): string {
  const functionId = meta.id.split("#")[0];
  const match = functionId.match(/--(\w+)/);
  return match ? match[1] : functionId;
}

export default createMiddleware({
  onBeforeResponse: [
    (event) => {
      const meta = event.locals.serverFunctionMeta as { id: string } | undefined;
      if (!meta) return;
      appLog('http', `${event.request.method} ${extractFnName(meta)}`);
    },
  ],
});
