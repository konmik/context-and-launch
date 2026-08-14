import "server-only";
import { appLog } from "../core/infra/app-logger.js";
import { fileWatcher, operationTracker, projectRegistry } from "../core/config/instances.js";

export interface AppServices {
  log(category: string, message: string): void;
  shutdown(): void;
  drainOperations(): Promise<void>;
  listProjectSlugs(): string[];
}

export function createAppServices(): AppServices {
  return {
    log: appLog,
    shutdown: () => fileWatcher.stopAll(),
    drainOperations: () => operationTracker.waitForAll(),
    listProjectSlugs: () => projectRegistry.listProjects().map((p) => p.projectSlug),
  };
}

interface AppServicesGlobal {
  __contextLaunchServices?: AppServices;
}

export function publishAppServices(services = createAppServices()): AppServices {
  (globalThis as AppServicesGlobal).__contextLaunchServices = services;
  return services;
}
