import path from "path";
import { pathToFileURL } from "url";
import type { LocalFetch } from "./app-protocol.js";

export interface ServerHandle {
  localFetch: LocalFetch;
  appLog: (category: string, message: string) => void;
  shutdown: () => void;
  waitForPendingOps: () => Promise<void>;
  listProjectSlugs: () => string[];
}

interface ServerGlobal {
  __aiStagesServerApp?: {
    localFetch: LocalFetch;
    appLog: (category: string, message: string) => void;
  };
  __aiStagesServices?: {
    fileWatcher: { stopAll(): void };
    operationTracker: { waitForAll(): Promise<void>; hasPending(): boolean };
    projectRegistry: { listProjects(): { projectSlug: string }[] };
  };
}

export async function startServer(appRoot: string): Promise<ServerHandle> {
  const outputDir = appRoot.replace("app.asar", "app.asar.unpacked");
  const serverEntry = path.resolve(outputDir, ".output", "server", "index.mjs");
  await import(pathToFileURL(serverEntry).href);

  const g = globalThis as unknown as ServerGlobal;
  const serverApp = g.__aiStagesServerApp;
  if (!serverApp) {
    throw new Error(
      `Server bundle at ${serverEntry} did not publish its request handler. `
      + "The publish-server-app nitro plugin is missing from the build.",
    );
  }

  const shutdown = () => {
    g.__aiStagesServices?.fileWatcher.stopAll();
  };

  const waitForPendingOps = async () => {
    await g.__aiStagesServices?.operationTracker.waitForAll();
  };

  const listProjectSlugs = () =>
    g.__aiStagesServices?.projectRegistry.listProjects().map((p) => p.projectSlug) ?? [];

  return {
    localFetch: serverApp.localFetch,
    appLog: serverApp.appLog,
    shutdown,
    waitForPendingOps,
    listProjectSlugs,
  };
}
