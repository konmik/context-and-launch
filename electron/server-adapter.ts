import path from "path";
import { pathToFileURL } from "url";
import * as v from "valibot";
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

const FetchHandlerContractSchema = v.object({ fetch: v.function() });
const FetchHandlerSchema = v.custom<FetchHandler>((value) =>
  v.safeParse(FetchHandlerContractSchema, value).success);

declare global {
  var __contextLaunchServices: ServerServices | undefined;
}

export async function startServer(appRoot: string): Promise<ServerHandle> {
  const outputDir = appRoot.replace("app.asar", "app.asar.unpacked");
  const serverEntry = path.resolve(outputDir, "dist", "server", "server.js");
  const clientRoot = path.resolve(outputDir, "dist", "client");
  const serverModule = await import(pathToFileURL(serverEntry).href);
  const serverHandler = serverModule.default;

  const services = globalThis.__contextLaunchServices;
  const parsedServerHandler = v.safeParse(FetchHandlerSchema, serverHandler);
  if (!parsedServerHandler.success || !services) {
    throw new Error(
      `Server bundle at ${serverEntry} did not export its request handler or publish services.`,
    );
  }

  const handleRequest: AppRequestHandler = createBuiltAppHandler(parsedServerHandler.output, clientRoot);

  return {
    handleRequest,
    appLog: services.log,
    shutdown: services.shutdown,
    waitForPendingOps: services.drainOperations,
    listProjectSlugs: services.listProjectSlugs,
  };
}
