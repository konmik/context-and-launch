import { ProjectRegistry } from './project-registry.js';
import { BoardConfigManager } from './board-config.js';
import { WorktreeManager } from './worktree-manager.js';
import { FileWatcher } from './file-watcher.js';

export const projectRegistry = new ProjectRegistry();
export const boardConfigManager = new BoardConfigManager();
export const worktreeManager = new WorktreeManager();
export const fileWatcher = new FileWatcher();
