import { createServices, type ServiceContainer } from './service-container.js';
import { initializeDataDir } from './initialize.js';

interface ServiceGlobal { __aiStagesServices?: ServiceContainer }

function initializeServices(): ServiceContainer {
	const g = globalThis as unknown as ServiceGlobal;
	if (g.__aiStagesServices) return g.__aiStagesServices;
	const s = createServices(
		process.env.CONTEXT_LAUNCH_DATA_DIR || undefined,
		process.env.CONTEXT_LAUNCH_CONFIG_DEFAULTS_DIR || undefined,
	);
	initializeDataDir(s.configPaths);
	g.__aiStagesServices = s;
	return s;
}

const services = initializeServices();

export const configPaths = services.configPaths;
export const configRepo = services.configRepo;
export const commandTemplateStore = services.commandTemplateStore;
export const commandTemplateService = services.commandTemplateService;
export const herdrExec = services.herdrExec;
export const projectRegistry = services.projectRegistry;
export const boardConfigManager = services.boardConfigManager;
export const worktreeManager = services.worktreeManager;
export const fileWatcher = services.fileWatcher;
export const launcherConfigManager = services.launcherConfigManager;
export const agentWorktreeManager = services.agentWorktreeManager;
export const ticketSyncManager = services.ticketSyncManager;
export const projectPageService = services.projectPageService;
export const operationTracker = services.operationTracker;
export const syncPendingTracker = services.syncPendingTracker;
