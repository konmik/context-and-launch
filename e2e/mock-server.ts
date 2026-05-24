import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { BoardPageData, TicketInfo } from "./setup-test-data.js";

// seroval is used to serialize mock data in the format the SolidJS Start client expects
const seroval = await import("seroval");

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, ".output", "public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "_build", ".vite", "manifest.json");

// Server function IDs used by the SolidJS Start client
const LOAD_BOARD_ID = "src_server_actions_ts--loadBoard_query";
const CREATE_TICKET_ID = "src_server_actions_ts--createTicketAction_1";
const UPDATE_TICKET_ID = "src_server_actions_ts--updateTicketAction_1";
const DELETE_TICKET_ID = "src_server_actions_ts--deleteTicketAction_1";
const REORDER_TICKET_ID = "src_server_actions_ts--reorderTicketAction_1";
const GET_DEFAULT_SLUG_ID = "src_server_actions_ts--getDefaultSlug_query";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Build the SolidJS Start streaming response format.
 * The client uses a custom binary stream parser that reads:
 *   byte 0: newline (0x0a)
 *   bytes 1-10: hex-encoded payload length (10 chars)
 *   byte 11: newline (0x0a)
 *   bytes 12+: the seroval-serialized payload
 */
function buildServerFnResponse(data: unknown): Buffer {
  const serialized = seroval.serialize(data);
  const payloadBytes = Buffer.from(serialized, "utf-8");
  const hexLen = payloadBytes.length.toString(16).padStart(10, "0");
  return Buffer.concat([
    Buffer.from("\n"),
    Buffer.from(hexLen),
    Buffer.from("\n"),
    payloadBytes,
  ]);
}

/**
 * Build the window.manifest object that the SolidJS Start client expects.
 * This maps source file inputs to their built output paths and asset tags.
 * The server normally generates this via createProdManifest().json().
 */
function buildWindowManifest(viteManifest: Record<string, any>): Record<string, any> {
  const BASE = "/_build";
  const windowManifest: Record<string, any> = {};

  // Traverse the Vite manifest and collect assets for a given entry
  function findAssets(id: string, seen = new Set<string>()): any[] {
    if (seen.has(id)) return [];
    seen.add(id);
    const chunk = viteManifest[id];
    if (!chunk) return [];
    const assets: any[] = [];
    for (const cssFile of chunk.css || []) {
      assets.push({
        tag: "link",
        attrs: { href: `${BASE}/${cssFile}`, key: `${BASE}/${cssFile}`, rel: "stylesheet", fetchPriority: "high" },
      });
    }
    if (chunk.imports) {
      for (const imp of chunk.imports) {
        assets.push(...findAssets(imp, seen));
      }
    }
    // Add the JS file as a modulepreload
    assets.push({
      tag: "link",
      attrs: { href: `${BASE}/${chunk.file}`, key: `${BASE}/${chunk.file}`, rel: "modulepreload" },
    });
    return assets;
  }

  for (const [key, entry] of Object.entries(viteManifest)) {
    if (!(entry as any).isEntry) continue;
    windowManifest[key] = {
      output: `${BASE}/${(entry as any).file}`,
      assets: findAssets(key),
    };
  }

  return windowManifest;
}

/**
 * Read the Vite manifest and build the HTML page template
 * with correct script and CSS tags pointing to built assets.
 */
function buildHtmlTemplate(): string {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

  const clientEntry = manifest["virtual:$vinxi/handler/client"];
  const clientJs = clientEntry.file;
  const clientCss: string[] = clientEntry.css || [];

  // Collect all imported JS modules from client entry
  const jsImports: string[] = [];
  function collectImports(key: string) {
    const entry = manifest[key];
    if (!entry) return;
    if (jsImports.includes(entry.file)) return;
    jsImports.push(entry.file);
    if (entry.imports) {
      for (const imp of entry.imports) {
        collectImports(imp);
      }
    }
  }
  if (clientEntry.imports) {
    for (const imp of clientEntry.imports) {
      collectImports(imp);
    }
  }

  const cssLinks = clientCss
    .map((css: string) => `<link rel="stylesheet" href="/_build/${css}" />`)
    .join("\n    ");

  const modulePreloads = jsImports
    .map((js: string) => `<link rel="modulepreload" href="/_build/${js}" />`)
    .join("\n    ");

  // Build the window.manifest that the client runtime needs for routing
  const windowManifest = buildWindowManifest(manifest);
  const manifestScript = `<script>window.manifest = ${JSON.stringify(windowManifest)};</script>`;

  // The hydration script initializes _$HY for SolidJS.
  // Setting done:true tells the client to use render() instead of hydrate(),
  // which is what we want since we serve an empty #app div (no SSR content).
  const hydrationScript = `<script>window._$HY={events:[],completed:new WeakSet,r:{},fe(){},done:true};</script>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Stages</title>
    <script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()</script>
    ${cssLinks}
    ${modulePreloads}
  </head>
  <body>
    <div id="app"></div>
    ${hydrationScript}
    ${manifestScript}
    <script type="module" src="/_build/${clientJs}"></script>
  </body>
</html>`;
}

export interface MockServerState {
  boardData: BoardPageData;
  launcherConfig?: { templates: { name: string; text: string; scope: string }[]; skills: { name: string; text: string; scope: string }[]; columnDefaults: Record<string, any>; worktreeRootPath: string | null };
  onLaunchAgent?: (slug: string, folderName: string, body: any) => { status: number; body: any } | Promise<{ status: number; body: any }>;
  onCreateTicket?: (slug: string, number: string, title: string) => { success: true } | { error: string };
  onUpdateTicket?: (slug: string, folderName: string, number: string | null, title: string | null, status: string | null) => { success: true } | { error: string };
  onDeleteTicket?: (slug: string, folderName: string) => { success: true } | { error: string };
  onReorderTicket?: (slug: string, folderName: string, fromColumn: string, toColumn: string, newIndex: number) => { success: true } | { error: string };
}

export function startMockServer(port: number, state: MockServerState): Promise<http.Server> {
  const htmlTemplate = buildHtmlTemplate();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // Handle WebSocket upgrade for heartbeat (just ignore it gracefully)
    if (pathname === "/api/heartbeat") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    // Handle server function requests (GET queries and POST mutations)
    if (pathname === "/_server" || pathname === "/_server/") {
      handleServerFunction(req, res, url, state);
      return;
    }

    // Serve static assets from the build output
    if (pathname.startsWith("/_build/") || pathname.startsWith("/_server/") || pathname.startsWith("/assets/")) {
      serveStaticFile(res, pathname);
      return;
    }

    // Handle API routes
    if (pathname.startsWith("/api/")) {
      // Launcher config endpoint
      if (pathname.match(/\/api\/projects\/[^/]+\/launcher-config$/) && req.method === "GET") {
        const config = state.launcherConfig ?? { templates: [], skills: [], columnDefaults: {}, worktreeRootPath: null };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(config));
        return;
      }

      // Agent launch endpoint
      if (pathname.includes("/ai/run") && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          if (state.onLaunchAgent) {
            const parts = pathname.split("/");
            const ticketsIdx = parts.indexOf("tickets");
            const slug = parts[parts.indexOf("projects") + 1];
            const folderName = ticketsIdx >= 0 ? parts[ticketsIdx + 1] : "";
            let body: any = {};
            try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch {}
            const sendResult = (result: { status: number; body: any }) => {
              if (typeof result.body === "string") {
                res.writeHead(result.status, { "Content-Type": "text/plain" });
                res.end(result.body);
              } else {
                res.writeHead(result.status, { "Content-Type": "application/json" });
                res.end(result.body != null ? JSON.stringify(result.body) : "");
              }
            };
            const result = state.onLaunchAgent(slug, folderName, body);
            if (result && typeof (result as any).then === "function") {
              (result as Promise<{ status: number; body: any }>).then(sendResult);
            } else {
              sendResult(result as { status: number; body: any });
            }
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          }
        });
        return;
      }

      // Stage file content
      if (pathname.includes("/stages/") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content: "" }));
        return;
      }

      // Use-worktree toggle
      if (pathname.includes("/use-worktree") && req.method === "PUT") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname.includes("/board/reorder") && req.method === "POST") {
        // The page uses fetch("/api/projects/:slug/board/reorder") for reorder
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (state.onReorderTicket) {
              const slug = state.boardData.slug;
              state.onReorderTicket(slug, body.folderName, body.fromColumn, body.toColumn, body.newIndex);
            }
          } catch (err) {
            console.error("Error parsing reorder body:", err);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // All other routes: return the SPA HTML template
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlTemplate);
  });

  // Handle WebSocket upgrade requests for heartbeat
  server.on("upgrade", (req, socket) => {
    // Respond with a minimal WebSocket handshake then keep it open
    const key = req.headers["sec-websocket-key"];
    if (key) {
      const crypto = require("node:crypto");
      const acceptKey = crypto
        .createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-5AB5DF85E7E5")
        .digest("base64");
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n"
      );
      // Keep the socket open; just ignore any messages
      socket.on("data", () => {
        // ignore heartbeat pings from client
      });
      socket.on("error", () => {
        // socket error during e2e test, ignore
      });
    } else {
      socket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "localhost", () => resolve(server));
    server.on("error", reject);
  });
}

export function stopMockServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    // Force-close all connections first (including WebSocket upgrades),
    // then close the server.
    server.closeAllConnections?.();
    server.close(() => resolve());
    // If close doesn't resolve within 2s, resolve anyway
    setTimeout(resolve, 2000);
  });
}

function handleServerFunction(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  state: MockServerState
) {
  const serverId = req.headers["x-server-id"] as string | undefined;
  const urlId = url.searchParams.get("id");
  const fnId = serverId || urlId || "";

  // GET requests (queries like loadBoard, getDefaultSlug)
  if (req.method === "GET") {
    handleGetQuery(fnId, url, res, state);
    return;
  }

  // POST requests (mutations like createTicket, updateTicket, deleteTicket)
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      handlePostMutation(fnId, body, req, res, state);
    });
    return;
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
}

function handleGetQuery(fnId: string, url: URL, res: http.ServerResponse, state: MockServerState) {
  let responseData: unknown;

  if (fnId.includes(LOAD_BOARD_ID)) {
    responseData = state.boardData;
  } else if (fnId.includes(GET_DEFAULT_SLUG_ID)) {
    responseData = state.boardData.slug;
  } else {
    res.writeHead(404);
    res.end(`Unknown server function: ${fnId}`);
    return;
  }

  const responseBuffer = buildServerFnResponse(responseData);
  // Content-Type must NOT be text/plain or application/json.
  // The client checks: if text/plain -> reads as raw text; if application/json -> parses as JSON.
  // Only when neither matches and x-serialized is set does it use the streaming seroval parser (Dt).
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "x-serialized": "true",
  });
  res.end(responseBuffer);
}

function handlePostMutation(
  fnId: string,
  body: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: MockServerState
) {
  let responseData: unknown = { success: true };

  try {
    // The body may be JSON-stringified seroval output (when x-serialized header is set),
    // or it could be a FormData/URLSearchParams body.
    // For our mock, we try to parse the JSON wrapper then eval the seroval payload.
    let args: unknown[] = [];
    const isSerialized = req.headers["x-serialized"] === "true";
    if (isSerialized && body) {
      // The client sends JSON.stringify({t: AST, f: features, m: marked})
      // where t is a seroval cross-serialized AST tree (not a string).
      // We use seroval.fromCrossJSON to reconstruct the original JS values.
      const parsed = JSON.parse(body);
      if (parsed && parsed.t != null) {
        args = seroval.fromCrossJSON(parsed.t, { plugins: [] }) as unknown[];
      }
    }

    if (fnId.includes(CREATE_TICKET_ID)) {
      if (state.onCreateTicket) {
        const [slug, number, title] = args as [string, string, string];
        responseData = state.onCreateTicket(slug, number, title);
      }
    } else if (fnId.includes(UPDATE_TICKET_ID)) {
      if (state.onUpdateTicket) {
        const [slug, folderName, number, title, status] = args as [string, string, string | null, string | null, string | null];
        responseData = state.onUpdateTicket(slug, folderName, number, title, status);
      }
    } else if (fnId.includes(DELETE_TICKET_ID)) {
      if (state.onDeleteTicket) {
        const [slug, folderName] = args as [string, string];
        responseData = state.onDeleteTicket(slug, folderName);
      }
    } else if (fnId.includes(REORDER_TICKET_ID)) {
      if (state.onReorderTicket) {
        const [slug, folderName, fromColumn, toColumn, newIndex] = args as [string, string, string, string, number];
        responseData = state.onReorderTicket(slug, folderName, fromColumn, toColumn, newIndex);
      }
    }
  } catch (err) {
    console.error("Error handling server function:", fnId, err);
    responseData = { error: String(err) };
  }

  const responseBuffer = buildServerFnResponse(responseData);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "x-serialized": "true",
  });
  res.end(responseBuffer);
}

function serveStaticFile(res: http.ServerResponse, pathname: string) {
  // Map URL path to file path under .output/public/
  const relativePath = decodeURIComponent(pathname);
  const filePath = path.join(PUBLIC_DIR, relativePath);

  // Security: ensure we stay within PUBLIC_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = fs.readFileSync(resolved);
    const mimeType = getMimeType(resolved);
    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end(`Not found: ${pathname}`);
  }
}
