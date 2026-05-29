import { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { ProjectRegistry } from '../project/project-registry.js';
import { BoardConfigManager } from '../project/board-config.js';
import { WorktreeManager } from '../worktree/worktree-manager.js';
import { FileWatcher } from '../infra/file-watcher.js';
import { LauncherConfigManager } from '../launcher/launcher-config.js';
import { AgentWorktreeManager } from '../worktree/agent-worktree.js';
import { TicketSyncManager } from '../ticket/ticket-sync.js';
import { GitRepository } from '../infra/git-repository.js';
import { BoardService } from '../board/board-service.js';

export interface ServiceContainer {
	configPaths: ConfigPaths;
	configRepo: ConfigRepository;
	gitRepo: GitRepository;
	projectRegistry: ProjectRegistry;
	boardConfigManager: BoardConfigManager;
	worktreeManager: WorktreeManager;
	fileWatcher: FileWatcher;
	launcherConfigManager: LauncherConfigManager;
	agentWorktreeManager: AgentWorktreeManager;
	ticketSyncManager: TicketSyncManager;
	boardService: BoardService;
}

export function createServices(baseDir?: string): ServiceContainer {
	const configPaths = new ConfigPaths(baseDir);
	const configRepo = new ConfigRepository();
	const gitRepo = new GitRepository();

	const projectRegistry = new ProjectRegistry(configPaths, configRepo);
	const boardConfigManager = new BoardConfigManager(configPaths, configRepo);
	const worktreeManager = new WorktreeManager(
		configPaths, (projectSlug) => projectRegistry.getTicketsPath(projectSlug),
	);
	const fileWatcher = new FileWatcher();
	const launcherConfigManager = new LauncherConfigManager(configPaths);
	const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager, configPaths);
	const ticketSyncManager = new TicketSyncManager(gitRepo);
	const boardService = new BoardService(
		projectRegistry, boardConfigManager, worktreeManager,
		fileWatcher, launcherConfigManager, ticketSyncManager,
	);

	return {
		configPaths,
		configRepo,
		gitRepo,
		projectRegistry,
		boardConfigManager,
		worktreeManager,
		fileWatcher,
		launcherConfigManager,
		agentWorktreeManager,
		ticketSyncManager,
		boardService,
	};
}
