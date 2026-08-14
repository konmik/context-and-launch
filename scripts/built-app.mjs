import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function readStaticResponse(request, clientRoot, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const root = path.resolve(clientRoot);
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    if (!(await stat(candidate)).isFile()) return undefined;
    const body = request.method === "HEAD" ? null : await readFile(candidate);
    return new Response(body, {
      headers: { "content-type": mimeTypes.get(path.extname(candidate)) ?? "application/octet-stream" },
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return undefined;
    throw error;
  }
}

export function createBuiltAppHandler(serverHandler, clientRoot) {
  if (!serverHandler || typeof serverHandler.fetch !== "function") {
    throw new Error("The built server module does not export a fetch handler.");
  }
  return async function handleRequest(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/_server" || pathname.startsWith("/_server/") || pathname.startsWith("/api/")) {
      return serverHandler.fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return serverHandler.fetch(request);
    const asset = await readStaticResponse(request, clientRoot, pathname);
    if (asset) return asset;
    return await readStaticResponse(request, clientRoot, "/index.html")
      ?? new Response("Not found", { status: 404 });
  };
}
