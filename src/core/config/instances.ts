import { createServices, type ServiceContainer } from './service-container.js';
import { initializeDataDir } from './initialize.js';

declare global {
	var __serviceContainer: ServiceContainer | undefined;
}

function readPositiveMs(name: string): number | undefined {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return undefined;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive number of milliseconds, got "${raw}".`);
	}
	return parsed;
}

function createInitializedServices(): ServiceContainer {
	const services = createServices({
		baseDir: process.env.CONTEXT_LAUNCH_DATA_DIR || undefined,
		configDefaultsDir: process.env.CONTEXT_LAUNCH_CONFIG_DEFAULTS_DIR || undefined,
		watchDebounceMs: readPositiveMs('CONTEXT_LAUNCH_WATCH_DEBOUNCE_MS'),
	});
	initializeDataDir(services.configPaths);
	return services;
}

const services = globalThis.__serviceContainer ??= createInitializedServices();

export const configPaths = services.configPaths;
export const configRepo = services.configRepo;
export const appConfigStore = services.appConfigStore;
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
export const worktreeRevisions = services.worktreeRevisions;
export const diffReviewStore = services.diffReviewStore;
export const diffReviewGitService = services.diffReviewGitService;
export const diffReviewTargetResolver = services.diffReviewTargetResolver;
export const reviewPromptQueueService = services.reviewPromptQueueService;
