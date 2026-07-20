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
import { ProjectPageService } from '../board/project-page-service.js';
import { OperationTracker } from '../infra/operation-tracker.js';
import { SyncPendingTracker, checkHasPendingChanges } from '../board/sync-pending.js';
import { CommandTemplateStore } from '../command-template/command-template-store.js';
import { CommandTemplateService } from '../command-template/command-template-service.js';
import { FixedPlatformShellRunner } from '../command-template/platform-shell-runner.js';
import { createHerdrExec } from '../herdr/herdr-exec.js';
import type { HerdrExecFn } from '../herdr/herdr-exec.js';

export interface ServiceContainer {
	configPaths: ConfigPaths;
	configRepo: ConfigRepository;
	commandTemplateStore: CommandTemplateStore;
	commandTemplateService: CommandTemplateService;
	herdrExec: HerdrExecFn;
	gitRepo: GitRepository;
	projectRegistry: ProjectRegistry;
	boardConfigManager: BoardConfigManager;
	worktreeManager: WorktreeManager;
	fileWatcher: FileWatcher;
	launcherConfigManager: LauncherConfigManager;
	agentWorktreeManager: AgentWorktreeManager;
	ticketSyncManager: TicketSyncManager;
	projectPageService: ProjectPageService;
	operationTracker: OperationTracker;
	syncPendingTracker: SyncPendingTracker;
}

export function createServices(baseDir?: string, configDefaultsDir?: string): ServiceContainer {
	const configPaths = new ConfigPaths(baseDir, configDefaultsDir);
	const configRepo = new ConfigRepository();
	const commandTemplateStore = new CommandTemplateStore(configPaths, configRepo);
	const commandTemplateService = new CommandTemplateService(
		commandTemplateStore, new FixedPlatformShellRunner(),
	);
	const herdrExec = createHerdrExec(commandTemplateService);
	const gitRepo = new GitRepository(commandTemplateService);

	const projectRegistry = new ProjectRegistry(configPaths, configRepo);
	const boardConfigManager = new BoardConfigManager(configPaths, configRepo);
	const worktreeManager = new WorktreeManager(
		configPaths, commandTemplateService, (projectSlug) => projectRegistry.getTicketsPath(projectSlug),
	);
	const syncPendingTracker = new SyncPendingTracker(
		(worktreeDir) => checkHasPendingChanges(worktreeDir, commandTemplateService),
	);
	const fileWatcher = new FileWatcher(
		commandTemplateService, (worktreeDir) => syncPendingTracker.invalidate(worktreeDir),
	);
	const launcherConfigManager = new LauncherConfigManager(configPaths, configRepo);
	const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager, commandTemplateService);
	const ticketSyncManager = new TicketSyncManager(commandTemplateService, gitRepo);
	const operationTracker = new OperationTracker();
	const projectPageService = new ProjectPageService(
		projectRegistry, boardConfigManager, worktreeManager,
		fileWatcher, ticketSyncManager, launcherConfigManager,
	);

	return {
		configPaths,
		configRepo,
		commandTemplateStore,
		commandTemplateService,
		herdrExec,
		gitRepo,
		projectRegistry,
		boardConfigManager,
		worktreeManager,
		fileWatcher,
		launcherConfigManager,
		agentWorktreeManager,
		ticketSyncManager,
		projectPageService,
		operationTracker,
		syncPendingTracker,
	};
}
