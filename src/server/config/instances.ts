import { createServices } from './service-container.js';
import { initializeDataDir } from './initialize.js';

const services = createServices(process.env.CONTEXT_LAUNCH_DATA_DIR || undefined);
initializeDataDir(services.configPaths);

export const configPaths = services.configPaths;
export const configRepo = services.configRepo;
export const projectRegistry = services.projectRegistry;
export const boardConfigManager = services.boardConfigManager;
export const worktreeManager = services.worktreeManager;
export const fileWatcher = services.fileWatcher;
export const launcherConfigManager = services.launcherConfigManager;
export const agentWorktreeManager = services.agentWorktreeManager;
export const ticketSyncManager = services.ticketSyncManager;
export const boardService = services.boardService;
