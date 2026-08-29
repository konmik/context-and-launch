import path from "path";
import { pathToFileURL } from "url";
import type { AppRequestHandler } from "./app-protocol.js";
import { createBuiltAppHandler, type FetchHandler } from "../scripts/built-app.mjs";

export interface ServerHandle {
  handleRequest: AppRequestHandler;
  appLog: (category: string, message: string) => void;
  shutdown: () => void;
  waitForPendingOps: () => Promise<void>;
  listProjectSlugs: () => string[];
}

interface ServerServices {
  log(category: string, message: string): void;
  shutdown(): void;
  drainOperations(): Promise<void>;
  listProjectSlugs(): string[];
}

declare global {
  var __contextLaunchServices: ServerServices | undefined;
}

export async function startServer(appRoot: string): Promise<ServerHandle> {
  const outputDir = appRoot.replace("app.asar", "app.asar.unpacked");
  const serverEntry = path.resolve(outputDir, "dist", "server", "server.js");
  const clientRoot = path.resolve(outputDir, "dist", "client");
  const serverModule = await import(pathToFileURL(serverEntry).href) as { default?: FetchHandler };
  const serverHandler = serverModule.default;

  const services = globalThis.__contextLaunchServices;
  if (!serverHandler || typeof serverHandler.fetch !== "function" || !services) {
    throw new Error(
      `Server bundle at ${serverEntry} did not export its request handler or publish services.`,
    );
  }

  const handleRequest: AppRequestHandler = createBuiltAppHandler(serverHandler, clientRoot);

  return {
    handleRequest,
    appLog: services.log,
    shutdown: services.shutdown,
    waitForPendingOps: services.drainOperations,
    listProjectSlugs: services.listProjectSlugs,
  };
}
