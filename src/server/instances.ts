import { ProjectRegistry } from './project-registry.js';
import { BoardConfigManager } from './board-config.js';
import { WorktreeManager } from './worktree-manager.js';
import { FileWatcher } from './file-watcher.js';
import { LauncherConfigManager } from './launcher-config.js';
import { AgentWorktreeManager } from './agent-worktree.js';

const configDir = process.env.AI_STAGES_DATA_DIR || undefined;

export const projectRegistry = new ProjectRegistry(configDir);
export const boardConfigManager = new BoardConfigManager(configDir);
export const worktreeManager = new WorktreeManager(configDir);
export const fileWatcher = new FileWatcher();
export const launcherConfigManager = new LauncherConfigManager(configDir);
export const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager);
