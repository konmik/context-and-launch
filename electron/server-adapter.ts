import net from "net";
import path from "path";
import { pathToFileURL } from "url";

export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close(() => reject(new Error("Failed to reserve port")));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

export interface ServerHandle {
  port: number;
  shutdown: () => void;
  waitForPendingOps: () => Promise<void>;
  listProjectSlugs: () => string[];
}

export async function startServer(appRoot: string): Promise<ServerHandle> {
  const port = await reservePort();
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";

  const outputDir = appRoot.replace("app.asar", "app.asar.unpacked");
  const serverEntry = path.resolve(outputDir, ".output", "server", "index.mjs");
  await import(pathToFileURL(serverEntry).href);

  interface ServiceGlobal {
    __aiStagesServices?: {
      fileWatcher: { stopAll(): void };
      operationTracker: { waitForAll(): Promise<void>; hasPending(): boolean };
      projectRegistry: { listProjects(): { projectSlug: string }[] };
    };
  }
  const g = globalThis as unknown as ServiceGlobal;

  const shutdown = () => {
    g.__aiStagesServices?.fileWatcher.stopAll();
  };

  const waitForPendingOps = async () => {
    await g.__aiStagesServices?.operationTracker.waitForAll();
  };

  const listProjectSlugs = () =>
    g.__aiStagesServices?.projectRegistry.listProjects().map((p) => p.projectSlug) ?? [];

  return { port, shutdown, waitForPendingOps, listProjectSlugs };
}
