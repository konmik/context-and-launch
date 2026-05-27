import { ConfigPaths } from './config-paths.js';
import { ProjectRegistry } from './project-registry.js';
import { BoardConfigManager } from './board-config.js';
import { WorktreeManager } from './worktree-manager.js';
import { FileWatcher } from './file-watcher.js';
import { LauncherConfigManager } from './launcher-config.js';
import { AgentWorktreeManager } from './agent-worktree.js';
import { TicketSyncManager } from './ticket-sync.js';

const configPaths = new ConfigPaths(process.env.CONTEXT_LAUNCH_DATA_DIR || undefined);

export const projectRegistry = new ProjectRegistry(configPaths);
export const boardConfigManager = new BoardConfigManager(configPaths);
export const worktreeManager = new WorktreeManager(configPaths);
export const fileWatcher = new FileWatcher();
export const launcherConfigManager = new LauncherConfigManager(configPaths);
export const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager, configPaths);
export const ticketSyncManager = new TicketSyncManager();
