import { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { AppConfigStore } from './app-config-store.js';
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
import { WorktreeRevisionStore } from '../board/worktree-revision.js';
import { CommandTemplateStore } from '../command-template/command-template-store.js';
import { CommandTemplateService } from '../command-template/command-template-service.js';
import { FixedPlatformShellRunner } from '../command-template/platform-shell-runner.js';
import { createHerdrExec } from '../herdr/herdr-exec.js';
import type { HerdrExecFn } from '../herdr/herdr-exec.js';
import { DiffReviewStore } from '../diff-review/diff-review-store.js';
import { DiffReviewGitService } from '../diff-review/diff-review-git.js';
import { DiffReviewTargetResolver } from '../diff-review/diff-review-target.js';
import { ReviewPromptQueueService } from '../diff-review/review-prompt-queue.js';
import { ProfileReviewAgentLauncher } from '../diff-review/review-agent-launcher.js';
import { fetchHerdrTicketState } from '../herdr/herdr-client.js';
import { HerdrUnavailableError } from '../herdr/herdr-availability.js';

export interface ServiceContainer {
	configPaths: ConfigPaths;
	configRepo: ConfigRepository;
	appConfigStore: AppConfigStore;
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
	worktreeRevisions: WorktreeRevisionStore;
	diffReviewStore: DiffReviewStore;
	diffReviewGitService: DiffReviewGitService;
	diffReviewTargetResolver: DiffReviewTargetResolver;
	reviewPromptQueueService: ReviewPromptQueueService;
}

export interface ServiceOptions {
	baseDir?: string;
	configDefaultsDir?: string;
	/** Quiet period before the file watcher auto-commits. Defaults to the FileWatcher default. */
	watchDebounceMs?: number;
}

export function createServices(options: ServiceOptions = {}): ServiceContainer {
	const { baseDir, configDefaultsDir, watchDebounceMs } = options;
	const configPaths = new ConfigPaths(baseDir, configDefaultsDir);
	const configRepo = new ConfigRepository();
	const commandTemplateStore = new CommandTemplateStore(configPaths, configRepo);
	const commandTemplateService = new CommandTemplateService(
		commandTemplateStore, new FixedPlatformShellRunner(),
	);
	const herdrExec = createHerdrExec(commandTemplateService);
	const gitRepo = new GitRepository(commandTemplateService);

	const appConfigStore = new AppConfigStore(configPaths, configRepo);
	const projectRegistry = new ProjectRegistry(configPaths, configRepo, appConfigStore);
	const boardConfigManager = new BoardConfigManager(configPaths, configRepo);
	const worktreeManager = new WorktreeManager(
		configPaths, commandTemplateService, (projectSlug) => projectRegistry.getTicketsPath(projectSlug),
	);
	const worktreeRevisions = new WorktreeRevisionStore();
	const syncPendingTracker = new SyncPendingTracker(
		(worktreeDir) => checkHasPendingChanges(worktreeDir, commandTemplateService),
		worktreeRevisions,
	);
	const fileWatcher = new FileWatcher(
		commandTemplateService, (worktreeDir) => worktreeRevisions.bump(worktreeDir),
		undefined, watchDebounceMs,
	);
	const launcherConfigManager = new LauncherConfigManager(configPaths, configRepo);
	const agentWorktreeManager = new AgentWorktreeManager(launcherConfigManager, commandTemplateService);
	const diffReviewStore = new DiffReviewStore(configPaths, configRepo);
	const diffReviewGitService = new DiffReviewGitService(commandTemplateService);
	const diffReviewTargetResolver = new DiffReviewTargetResolver(
		projectRegistry, worktreeManager, launcherConfigManager,
	);
	const reviewPromptQueueService = new ReviewPromptQueueService(
		diffReviewStore,
		diffReviewGitService,
		diffReviewTargetResolver,
		commandTemplateService,
		new ProfileReviewAgentLauncher(launcherConfigManager, commandTemplateService),
		async (projectSlug) => {
			const observedAt = Date.now();
			try {
				const state = await fetchHerdrTicketState(projectSlug, herdrExec);
				return { agents: state.agents, observedAt };
			} catch (error) {
				if (error instanceof HerdrUnavailableError) {
					return error.reason === 'cli-missing'
						? { agents: [], observedAt }
						: undefined;
				}
				throw error;
			}
		},
	);
	const ticketSyncManager = new TicketSyncManager(commandTemplateService, gitRepo);
	const operationTracker = new OperationTracker();
	const projectPageService = new ProjectPageService(
		projectRegistry, boardConfigManager, worktreeManager,
		fileWatcher, ticketSyncManager, launcherConfigManager,
	);

	return {
		configPaths,
		configRepo,
		appConfigStore,
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
		worktreeRevisions,
		diffReviewStore,
		diffReviewGitService,
		diffReviewTargetResolver,
		reviewPromptQueueService,
	};
}
