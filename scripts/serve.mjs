import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(projectRoot, ".output", "server", "index.mjs");
const { handler } = await import(pathToFileURL(entry).href);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const server = http.createServer(handler);
// Idle keep-alive connections must outlive any client's polling interval, or a
// client reusing a connection races the server closing it and the request dies
// with a transport error.
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.listen(port, host, () => {
  console.log(`Listening on http://${host}:${port}`);
});
