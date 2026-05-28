import { ConfigPaths } from './config-paths.js';
import { ProjectRegistry } from '../project/project-registry.js';
import { BoardConfigManager } from '../project/board-config.js';
import { WorktreeManager } from '../worktree/worktree-manager.js';
import { FileWatcher } from '../infra/file-watcher.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { AgentWorktreeManager } from '../worktree/agent-worktree.js';
import { TicketSyncManager } from '../ticket/ticket-sync.js';

export const configPaths = new ConfigPaths(process.env.CONTEXT_LAUNCH_DATA_DIR || undefined);

export const projectRegistry = new ProjectRegistry(configPaths);
export const boardConfigManager = new BoardConfigManager(configPaths);
export const worktreeManager = new WorktreeManager(configPaths, (slug) => projectRegistry.getTicketsPath(slug));
export const fileWatcher = new FileWatcher();
export const launcherConfigManager = new LauncherConfigManager(configPaths);
export const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager, configPaths);
export const ticketSyncManager = new TicketSyncManager();
