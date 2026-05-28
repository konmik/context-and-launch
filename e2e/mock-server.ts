import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BOARDS, type BoardPageData, type TicketInfo, type BoardDefinition, type ColumnDefinition } from "./setup-test-data.js";
import { slugifyColumnName } from "~/lib/slugify.js";

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
const ADD_PROJECT_ID = "src_server_actions_ts--addProjectAction_1";
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
    <title>Context & Launch</title>
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
  boards?: BoardDefinition[];
  launcherConfig?: { templates: { name: string; text: string; scope: string }[]; skills: { name: string; text: string; scope: string; order?: number }[]; profiles?: { name: string; command: string; scope: string }[]; shortcuts?: { name: string; command: string; scope: string }[]; columnDefaults: Record<string, any>; worktreeRootPath: string | null; boardId?: string | null };
  onLaunchAgent?: (slug: string, folderName: string, body: any) => { status: number; body: any } | Promise<{ status: number; body: any }>;
  onCreateTicket?: (slug: string, number: string, title: string) => { success: true } | { error: string };
  onUpdateTicket?: (slug: string, folderName: string, number: string | null, title: string | null, status: string | null) => { success: true } | { error: string };
  onDeleteTicket?: (slug: string, folderName: string) => { success: true } | { error: string };
  onAddProject?: (path: string, branch: string) => { slug?: string; error?: string };
  onReorderTicket?: (slug: string, folderName: string, fromColumn: string, toColumn: string, newIndex: number) => { success: true } | { error: string };
  onSync?: (slug: string) => { status: "success" } | { status: "conflict" } | { status: "error"; message: string };
  onSyncAbort?: (slug: string) => { success: true } | { error: string };
  onResolveConflicts?: (slug: string) => { success: true } | { error: string };
  referenceFileContents?: Record<string, string>;
  uploadedFiles?: Record<string, Buffer>;
  failColumnPut?: boolean;
}

function getBoards(state: MockServerState): BoardDefinition[] {
  if (!state.boards) {
    state.boards = structuredClone(DEFAULT_BOARDS);
  }
  return state.boards!;
}

function handleBoardApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, state: MockServerState): boolean {
  // GET /api/boards
  if (pathname === "/api/boards" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getBoards(state)));
    return true;
  }

  // POST /api/boards
  if (pathname === "/api/boards" && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const boards = getBoards(state);
        const id = slugifyColumnName(body.name);
        if (!id) { res.writeHead(400); res.end("Board name must not be empty"); return; }
        if (boards.some((b: BoardDefinition) => b.id === id)) { res.writeHead(400); res.end(`Board with id "${id}" already exists`); return; }
        const board: BoardDefinition = { id, name: body.name.trim(), columns: [] };
        boards.push(board);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(board));
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  // DELETE /api/boards/:boardId
  const boardDeleteMatch = pathname.match(/^\/api\/boards\/([^/]+)$/);
  if (boardDeleteMatch && req.method === "DELETE") {
    const boardId = boardDeleteMatch[1];
    const boards = getBoards(state);
    if (boards.length <= 1) { res.writeHead(400); res.end("Cannot delete the last board"); return true; }
    const idx = boards.findIndex((b: BoardDefinition) => b.id === boardId);
    if (idx < 0) { res.writeHead(400); res.end("Board not found"); return true; }
    boards.splice(idx, 1);
    // Cascade: clear boardId from launcher config if it references deleted board
    if (state.launcherConfig?.boardId === boardId) {
      state.launcherConfig.boardId = undefined;
    }
    res.writeHead(204);
    res.end();
    return true;
  }

  // PUT /api/boards/:boardId
  if (boardDeleteMatch && req.method === "PUT") {
    const boardId = boardDeleteMatch[1];
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        board.name = body.name?.trim() ?? board.name;
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  // POST /api/boards/:boardId/columns/:columnName/rename
  const renameMatch = pathname.match(/^\/api\/boards\/([^/]+)\/columns\/([^/]+)\/rename$/);
  if (renameMatch && req.method === "POST") {
    const boardId = renameMatch[1];
    const columnName = decodeURIComponent(renameMatch[2]);
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const newName = slugifyColumnName(body.newName);
        const col = board.columns.find((c: ColumnDefinition) => c.name === columnName);
        if (col) col.name = newName;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ newName, ticketsUpdated: 0, projectsUpdated: 0 }));
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  // PUT /api/boards/:boardId/columns/reorder
  const reorderMatch = pathname.match(/^\/api\/boards\/([^/]+)\/columns\/reorder$/);
  if (reorderMatch && req.method === "PUT") {
    const boardId = reorderMatch[1];
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const colMap = new Map(board.columns.map((c: ColumnDefinition) => [c.name, c]));
        board.columns = body.columns.map((n: string) => colMap.get(n)!).filter(Boolean);
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  // POST /api/boards/:boardId/columns
  const colAddMatch = pathname.match(/^\/api\/boards\/([^/]+)\/columns$/);
  if (colAddMatch && req.method === "POST") {
    const boardId = colAddMatch[1];
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const name = slugifyColumnName(body.name);
        if (!name) { res.writeHead(400); res.end("Column name must not be empty"); return; }
        if (name === "undefined") { res.writeHead(400); res.end('Column name "undefined" is reserved'); return; }
        if (board.columns.some((c: ColumnDefinition) => c.name === name)) { res.writeHead(400); res.end(`Column name "${name}" already exists`); return; }
        const col: ColumnDefinition = { name };
        if (body.description?.trim()) col.description = body.description.trim();
        board.columns.push(col);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(col));
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  // PUT or DELETE /api/boards/:boardId/columns/:columnName
  const colMatch = pathname.match(/^\/api\/boards\/([^/]+)\/columns\/([^/]+)$/);
  if (colMatch && (req.method === "PUT" || req.method === "DELETE")) {
    const boardId = colMatch[1];
    const columnName = decodeURIComponent(colMatch[2]);
    if (req.method === "DELETE") {
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return true; }
      board.columns = board.columns.filter((c: ColumnDefinition) => c.name !== columnName);
      res.writeHead(204);
      res.end();
      return true;
    }
    // PUT - update column description
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (state.failColumnPut) {
        res.writeHead(500);
        res.end("Simulated description update failure");
        return;
      }
      const boards = getBoards(state);
      const board = boards.find((b: BoardDefinition) => b.id === boardId);
      if (!board) { res.writeHead(400); res.end("Board not found"); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        const col = board.columns.find((c: ColumnDefinition) => c.name === columnName);
        if (col && body.description !== undefined) {
          col.description = body.description?.trim() || undefined;
        }
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(400);
        res.end(String(err));
      }
    });
    return true;
  }

  return false;
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
      // Board API routes
      if (handleBoardApi(req, res, pathname, state)) return;

      // Launcher config endpoint. Mirrors LauncherConfigManager.getMergedConfig:
      // skills are returned sorted by `order` (explicit wins, else canonical index).
      // Keep this in sync with that canonical implementation.
      if (pathname.match(/\/api\/projects\/[^/]+\/launcher-config$/) && req.method === "GET") {
        const config = state.launcherConfig ?? { templates: [], skills: [], profiles: [], shortcuts: [], columnDefaults: {}, worktreeRootPath: null };
        const skills = config.skills
          .map((s, i) => ({ ...s, order: typeof s.order === "number" ? s.order : i }))
          .sort((a, b) => a.order - b.order);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...config, skills }));
        return;
      }

      // Skill reorder: set a single skill's fractional order (user or project scope).
      if (pathname.match(/\/api\/(?:projects\/[^/]+\/)?launcher-config\/skills\/reorder$/) && req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const skill = state.launcherConfig?.skills.find((s) => s.name === body.name);
            if (skill) skill.order = body.order;
            res.writeHead(204);
            res.end();
          } catch (err) {
            res.writeHead(400);
            res.end(String(err));
          }
        });
        return;
      }

      if (pathname.match(/\/api\/projects\/[^/]+\/launcher-config\/column-defaults$/) && req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const { column, ...patch } = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (state.launcherConfig) {
              const existing = state.launcherConfig.columnDefaults[column] ?? { templateName: null, checkedSkills: [], profileName: null };
              state.launcherConfig.columnDefaults[column] = { ...existing, ...patch };
            }
            res.writeHead(204);
            res.end();
          } catch (err) {
            res.writeHead(400);
            res.end(String(err));
          }
        });
        return;
      }

      // Board ID assignment endpoint
      if (pathname.match(/\/api\/projects\/[^/]+\/launcher-config\/board-id$/) && req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (state.launcherConfig) {
              state.launcherConfig.boardId = body.boardId;
            }
          } catch (err) {
            console.error("Error parsing board-id body:", err);
          }
          res.writeHead(204);
          res.end();
        });
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

      // Ticket context content
      if (pathname.includes("/context/") && req.method === "GET") {
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

      // File upload endpoint
      if (pathname.includes("/files/upload") && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          // Parse multipart to extract filenames (simplified)
          const body = Buffer.concat(chunks);
          const bodyStr = body.toString("utf-8");
          const results: { name: string; ok: boolean }[] = [];

          // Simple multipart parsing to extract filename from Content-Disposition
          const boundary = (req.headers["content-type"] || "").split("boundary=")[1];
          if (boundary) {
            const parts = bodyStr.split(`--${boundary}`);
            for (const part of parts) {
              const filenameMatch = part.match(/filename="([^"]+)"/);
              if (filenameMatch) {
                const fileName = filenameMatch[1];
                if (!state.uploadedFiles) state.uploadedFiles = {};
                // Extract file content after the double newline
                const headerEnd = part.indexOf("\r\n\r\n");
                if (headerEnd >= 0) {
                  const content = part.slice(headerEnd + 4).replace(/\r\n$/, "");
                  state.uploadedFiles[fileName] = Buffer.from(content, "utf-8");
                }

                // Update ticket fileNames in board data
                const ticketParts = pathname.split("/");
                const ticketsIdx = ticketParts.indexOf("tickets");
                const folderName = ticketsIdx >= 0 ? ticketParts[ticketsIdx + 1] : "";
                const ticket = state.boardData.board?.tickets.find((t) => t.folderName === folderName);
                if (ticket && !ticket.fileNames.includes(fileName)) {
                  ticket.fileNames.push(fileName);
                  ticket.fileNames.sort();
                }
                results.push({ name: fileName, ok: true });
              }
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results }));
        });
        return;
      }

      // File content serve (GET) / delete (DELETE) for ticket files
      const fileMatch = pathname.match(/\/tickets\/([^/]+)\/files\/([^/]+)$/);
      if (fileMatch && !pathname.includes("/upload")) {
        if (req.method === "GET") {
          const fileName = decodeURIComponent(fileMatch[2]);
          const content = state.uploadedFiles?.[fileName];
          if (content) {
            const ext = path.extname(fileName).toLowerCase();
            const mimeMap: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".txt": "text/plain", ".md": "text/plain" };
            res.writeHead(200, { "Content-Type": mimeMap[ext] || "application/octet-stream" });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end("Not found");
          }
          return;
        }
        if (req.method === "DELETE") {
          const fileName = decodeURIComponent(fileMatch[2]);
          if (state.uploadedFiles) delete state.uploadedFiles[fileName];
          res.writeHead(204);
          res.end();
          return;
        }
      }

      if (pathname === "/api/browse" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ paths: [] }));
        return;
      }

      // References endpoint
      if (pathname.includes("/references") && !pathname.includes("/references/content") && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const ticketParts = pathname.split("/");
            const ticketsIdx = ticketParts.indexOf("tickets");
            const folderName = ticketsIdx >= 0 ? ticketParts[ticketsIdx + 1] : "";
            const ticket = state.boardData.board?.tickets.find((t) => t.folderName === folderName);
            if (ticket && body.paths) {
              for (const p of body.paths) {
                if (!ticket.references.some((r) => r.path === p)) {
                  ticket.references.push({ path: p, exists: true });
                }
              }
            }
          } catch (err) {
            console.error("Error parsing references body:", err);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }

      if (pathname.includes("/references") && !pathname.includes("/references/content") && req.method === "DELETE") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const ticketParts = pathname.split("/");
            const ticketsIdx = ticketParts.indexOf("tickets");
            const folderName = ticketsIdx >= 0 ? ticketParts[ticketsIdx + 1] : "";
            const ticket = state.boardData.board?.tickets.find((t) => t.folderName === folderName);
            if (ticket && body.path) {
              ticket.references = ticket.references.filter((r) => r.path !== body.path);
            }
          } catch (err) {
            console.error("Error parsing references delete body:", err);
          }
          res.writeHead(204);
          res.end();
        });
        return;
      }

      // Referenced file content
      if (pathname.includes("/references/content") && req.method === "GET") {
        const refPath = url.searchParams.get("path") || "";
        const content = state.referenceFileContents?.[refPath];
        if (content != null) {
          const ext = path.extname(refPath).toLowerCase();
          const isImg = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext);
          res.writeHead(200, { "Content-Type": isImg ? `image/${ext.slice(1)}` : "text/plain" });
          res.end(content);
        } else {
          res.writeHead(400);
          res.end("Referenced file not found");
        }
        return;
      }

      // Sync endpoint
      if (pathname.includes("/board/sync") && req.method === "POST") {
        const slug = pathname.split("/")[3];
        const result = state.onSync ? state.onSync(slug) : { status: "success" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname.includes("/board/sync") && req.method === "DELETE") {
        const slug = pathname.split("/")[3];
        const result = state.onSyncAbort ? state.onSyncAbort(slug) : { success: true };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // Resolve conflicts endpoint
      if (pathname.includes("/board/resolve-conflicts") && req.method === "POST") {
        const slug = pathname.split("/")[3];
        const result = state.onResolveConflicts ? state.onResolveConflicts(slug) : { success: true };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
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
      socket.on("error", (err) => {
        console.warn(`WebSocket error during e2e test: ${err.message}`);
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
    } else if (fnId.includes(ADD_PROJECT_ID)) {
      if (state.onAddProject) {
        const [path, branch] = args as [string, string];
        responseData = state.onAddProject(path, branch);
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
  } catch (err) {
    console.warn(`Static file ${pathname}: ${err instanceof Error ? err.message : String(err)}`);
    res.writeHead(404);
    res.end(`Not found: ${pathname}`);
  }
}
