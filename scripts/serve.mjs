import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBuiltAppHandler } from "./built-app.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(projectRoot, "dist", "server", "server.js");
const clientRoot = path.join(projectRoot, "dist", "client");
const serverProcessPath = process.env.CONTEXT_LAUNCH_SERVER_PROCESS_FILE
  ?? path.join(projectRoot, "dist", "server-process");
const serverModule = await import(pathToFileURL(entry).href);
const serverHandler = serverModule.default;

const handleRequest = createBuiltAppHandler(serverHandler, clientRoot);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

// This process serves exactly one build: it renders HTML from the client
// manifest on disk but answers asset requests from the file list baked into the
// build it loaded. Once someone rebuilds, it hands browsers asset URLs it cannot
// serve and every page it renders is blank. Launches take a free port so a new
// build always gets a new process, and this timeout retires the processes those
// launches leave behind, the way a build daemon retires an idle daemon.
const idleTimeoutMs = Number(
  process.env.CONTEXT_LAUNCH_IDLE_TIMEOUT_MS ?? 3 * 60 * 60 * 1000,
);
let idleTimer;

function restartIdleCountdown() {
  if (idleTimeoutMs <= 0) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log(`Exiting after ${idleTimeoutMs}ms without a request.`);
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }, idleTimeoutMs);
  idleTimer.unref();
}

async function readRequestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function writeResponse(response, nodeResponse) {
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return void nodeResponse.end();
  for await (const chunk of response.body) nodeResponse.write(chunk);
  nodeResponse.end();
}

const server = http.createServer(async (request, response) => {
  restartIdleCountdown();
  try {
    const origin = `http://${request.headers.host ?? `${host}:${port}`}`;
    const webRequest = new Request(new URL(request.url ?? "/", origin), {
      method: request.method,
      headers: request.headers,
      body: await readRequestBody(request),
    });
    await writeResponse(await handleRequest(webRequest), response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});
// Idle keep-alive connections must outlive any client's polling interval, or a
// client reusing a connection races the server closing it and the request dies
// with a transport error.
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.listen(port, host, () => {
  restartIdleCountdown();
  // The launch scripts stop this process on the next launch: it serves the
  // build sitting in dist, so it dies with that build. They are shell
  // scripts, so the file is the pid and the port on one line and nothing else.
  fs.writeFileSync(serverProcessPath, `${process.pid} ${port}\n`);
  console.log(`Listening on http://${host}:${port}`);
});
