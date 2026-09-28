import { createConfigPaths, type ConfigPaths } from './config-paths.js'
import { createConfigRepository, type ConfigRepository } from './config-repository.js'
import { createAppConfigStore, type AppConfigStore } from './app-config-store.js'
import { createSharedLauncherConfigStore, type SharedLauncherConfigStore } from '../launcher/shared-launcher-config-store.js'
import { createProjectRegistry, type ProjectRegistry } from '../project/project-registry.js'
import { createBoardConfigManager, type BoardConfigManager } from '../project/board-config.js'
import { createWorktreeManager, type WorktreeManager } from '../worktree/worktree-manager.js'
import { createFileWatcher, type FileWatcher } from '../infra/file-watcher.js'
import { createLauncherConfigManager, type LauncherConfigManager } from '../launcher/launcher-config.js'
import { createAgentWorktreeManager, type AgentWorktreeManager } from '../worktree/agent-worktree.js'
import { createTaskSyncManager, type TaskSyncManager } from '../task/task-sync.js'
import { createGitRepository, type GitRepository } from '../infra/git-repository.js'
import { createProjectPageService, type ProjectPageService } from '../board/project-page-service.js'
import { createOperationTracker, type OperationTracker } from '../infra/operation-tracker.js'
import { createSyncPendingTracker, type SyncPendingTracker, checkHasPendingChanges } from '../board/sync-pending.js'
import { createWorktreeRevisionStore, type WorktreeRevisionStore } from '../board/worktree-revision.js'
import { createCommandTemplateStore, type CommandTemplateStore } from '../command-template/command-template-store.js'
import { createCommandTemplateService, type CommandTemplateService } from '../command-template/command-template-service.js'
import { createFixedPlatformShellRunner } from '../command-template/platform-shell-runner.js'
import { createHerdrExec } from '../herdr/herdr-exec.js'
import type { HerdrExecFn } from '../herdr/herdr-exec.js'
import { createDiffReviewStore, type DiffReviewStore } from '../diff-review/diff-review-store.js'
import { createDiffReviewGitService, type DiffReviewGitService } from '../diff-review/diff-review-git.js'
import { createDiffReviewTargetResolver, type DiffReviewTargetResolver } from '../diff-review/diff-review-target.js'
import { createReviewPromptQueueService, type ReviewPromptQueueService } from '../diff-review/review-prompt-queue.js'
import { createProfileReviewAgentLauncher } from '../diff-review/review-agent-launcher.js'
import { fetchHerdrTaskState } from '../herdr/herdr-client.js'
import { isHerdrUnavailableError } from '../herdr/herdr-availability.js'

export interface ServiceContainer {
  configPaths: ConfigPaths
  configRepo: ConfigRepository
  appConfigStore: AppConfigStore
  sharedLauncherConfigStore: SharedLauncherConfigStore
  commandTemplateStore: CommandTemplateStore
  commandTemplateService: CommandTemplateService
  herdrExec: HerdrExecFn
  gitRepo: GitRepository
  projectRegistry: ProjectRegistry
  boardConfigManager: BoardConfigManager
  worktreeManager: WorktreeManager
  fileWatcher: FileWatcher
  launcherConfigManager: LauncherConfigManager
  agentWorktreeManager: AgentWorktreeManager
  taskSyncManager: TaskSyncManager
  projectPageService: ProjectPageService
  operationTracker: OperationTracker
  syncPendingTracker: SyncPendingTracker
  worktreeRevisions: WorktreeRevisionStore
  diffReviewStore: DiffReviewStore
  diffReviewGitService: DiffReviewGitService
  diffReviewTargetResolver: DiffReviewTargetResolver
  reviewPromptQueueService: ReviewPromptQueueService
}

export interface ServiceOptions {
  baseDir?: string
  configDefaultsDir?: string
  /** Quiet period before the file watcher auto-commits. Defaults to the FileWatcher default. */
  watchDebounceMs?: number
}

export function createServices(options: ServiceOptions = {}): ServiceContainer {
  const { baseDir, configDefaultsDir, watchDebounceMs } = options
  const configPaths = createConfigPaths(baseDir, configDefaultsDir)
  const configRepo = createConfigRepository()
  const commandTemplateStore = createCommandTemplateStore(configPaths, configRepo)
  const commandTemplateService = createCommandTemplateService(commandTemplateStore, createFixedPlatformShellRunner())
  const herdrExec = createHerdrExec(commandTemplateService)
  const gitRepo = createGitRepository(commandTemplateService)
  const appConfigStore = createAppConfigStore(configPaths, configRepo)
  const projectRegistry = createProjectRegistry(configPaths, configRepo, appConfigStore)
  const boardConfigManager = createBoardConfigManager(configPaths, configRepo)
  const worktreeManager = createWorktreeManager(configPaths, commandTemplateService, (projectSlug) =>
    projectRegistry.getTasksPath(projectSlug),
  )
  const worktreeRevisions = createWorktreeRevisionStore()
  const syncPendingTracker = createSyncPendingTracker(
    (worktreeDir) => checkHasPendingChanges(worktreeDir, commandTemplateService),
    worktreeRevisions,
  )
  const fileWatcher = createFileWatcher(
    commandTemplateService,
    (worktreeDir) => worktreeRevisions.bump(worktreeDir),
    undefined,
    watchDebounceMs,
  )
  const sharedLauncherConfigStore = createSharedLauncherConfigStore(configPaths, configRepo)
  const launcherConfigManager = createLauncherConfigManager(configPaths, configRepo, sharedLauncherConfigStore)
  const agentWorktreeManager = createAgentWorktreeManager(launcherConfigManager, commandTemplateService)
  const diffReviewStore = createDiffReviewStore(configPaths, configRepo)
  const diffReviewGitService = createDiffReviewGitService(commandTemplateService)
  const diffReviewTargetResolver = createDiffReviewTargetResolver(projectRegistry, worktreeManager, launcherConfigManager)
  const reviewPromptQueueService = createReviewPromptQueueService(
    diffReviewStore,
    diffReviewGitService,
    diffReviewTargetResolver,
    commandTemplateService,
    createProfileReviewAgentLauncher(launcherConfigManager, commandTemplateService),
    async (projectSlug) => {
      const observedAt = Date.now()
      try {
        const state = await fetchHerdrTaskState(projectSlug, herdrExec)
        return {
          agents: state.agents,
          observedAt,
        }
      } catch (error) {
        if (isHerdrUnavailableError(error)) {
          return error.reason === 'cli-missing'
            ? {
                agents: [],
                observedAt,
              }
            : undefined
        }
        throw error
      }
    },
  )
  const taskSyncManager = createTaskSyncManager(commandTemplateService, gitRepo)
  const operationTracker = createOperationTracker()
  const projectPageService = createProjectPageService(
    projectRegistry,
    boardConfigManager,
    worktreeManager,
    fileWatcher,
    taskSyncManager,
    launcherConfigManager,
  )
  return {
    configPaths,
    configRepo,
    appConfigStore,
    sharedLauncherConfigStore,
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
    taskSyncManager,
    projectPageService,
    operationTracker,
    syncPendingTracker,
    worktreeRevisions,
    diffReviewStore,
    diffReviewGitService,
    diffReviewTargetResolver,
    reviewPromptQueueService,
  }
}
