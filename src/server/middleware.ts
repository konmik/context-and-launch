import "server-only";
import { appLog } from "../core/infra/app-logger.js";
import { handleRawRoute } from "./raw-routes.js";

export default async function middleware(
  request: Request,
  next: () => Response | Promise<Response>,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/_server") appLog("http", `${request.method} ${pathname}`);
  return (await handleRawRoute(request)) ?? next();
}
