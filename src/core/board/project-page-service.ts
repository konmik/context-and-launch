import fs from 'fs'
import { createTaskStore } from '~/core/task/task-store.js'
import { resolveAgentWorktreeLocation, worktreeFolderName } from '~/core/worktree/worktree-naming.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { ProjectRegistry } from '~/core/project/project-registry.js'
import type { BoardConfigManager } from '~/core/project/board-config.js'
import type { WorktreeManager } from '~/core/worktree/worktree-manager.js'
import type { LauncherConfigManager } from '~/core/launcher/launcher-config.js'
import type { FileWatcher } from '~/core/infra/file-watcher.js'
import type { TaskSyncManager } from '~/core/task/task-sync.js'
import type { ProjectPageData, SyncStatus } from './board-types.js'

export interface ProjectPageService {
  loadProjectPage(projectSlug: string): Promise<ProjectPageData>
  loadSyncStatus(projectSlug: string): Promise<SyncStatus>
}

export function createProjectPageService(
  projectRegistry: ProjectRegistry,
  boardConfigManager: BoardConfigManager,
  worktreeManager: WorktreeManager,
  fileWatcher: FileWatcher,
  taskSyncManager: TaskSyncManager,
  launcherConfigManager: LauncherConfigManager,
): ProjectPageService {
  const projectGitQueue = new Map<string, Promise<unknown>>()

  function runOnProjectGitQueue<T>(projectSlug: string, task: () => Promise<T>): Promise<T> {
    const previous = projectGitQueue.get(projectSlug) ?? Promise.resolve()
    const run = previous.then(task, task)
    projectGitQueue.set(
      projectSlug,
      run.then(
        () => undefined,
        () => undefined,
      ),
    )
    return run
  }

  async function loadProjectPage(projectSlug: string): Promise<ProjectPageData> {
    const projects = projectRegistry.listProjects()
    const project = projects.find((p) => p.projectSlug === projectSlug)
    if (!project) {
      return {
        status: 'not-found' as const,
        projects,
        projectSlug,
      }
    }
    if (!project.available) {
      return {
        status: 'unavailable' as const,
        projects,
        projectSlug,
        projectPath: project.path,
      }
    }
    try {
      return await runOnProjectGitQueue(projectSlug, async () => {
        const worktreeDir = await worktreeManager.ensureWorktree(project.path, projectSlug, project.branch)
        fileWatcher.watch(worktreeDir)
        await taskSyncManager.finalizeResolution(worktreeDir)
        const config = boardConfigManager.getConfig(project.boardId)
        const store = createTaskStore(worktreeDir)
        const { tasks, taskOrder, suggestedNextNumber } = await store.loadBoardSnapshot(config.columns.map((c) => c.name))
        const worktreeSettings = launcherConfigManager.resolveWorktreeSettings(projectSlug)
        const worktreeRootPath = worktreeSettings.worktreeRootPath
        let worktreeNames: Set<string>
        try {
          worktreeNames = new Set(await fs.promises.readdir(worktreeRootPath))
        } catch (e) {
          if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            worktreeNames = new Set()
          } else {
            throw e
          }
        }
        const tasksWithWorktrees = tasks.map((task) => {
          const { worktreePath, isDefaultLocation } = resolveAgentWorktreeLocation(task.folderName, worktreeSettings, {
            savedWorktreePath: task.agentWorktreeDir,
          })
          const hasAgentWorktree = isDefaultLocation ? worktreeNames.has(worktreeFolderName(task.folderName)) : fs.existsSync(worktreePath)
          return {
            ...task,
            hasAgentWorktree,
          }
        })
        return {
          status: 'loaded' as const,
          projects,
          projectSlug,
          board: {
            tasks: tasksWithWorktrees,
            taskOrder,
          },
          projectPath: project.path,
          suggestedNextNumber,
        }
      })
    } catch (e) {
      return {
        status: 'error' as const,
        projects,
        projectSlug,
        projectPath: project.path,
        error: errorPayload(e, 'Tasks could not be loaded'),
      }
    }
  }

  async function loadSyncStatus(projectSlug: string): Promise<SyncStatus> {
    const project = projectRegistry.listProjects().find((p) => p.projectSlug === projectSlug)
    if (!project || !project.available) {
      return {
        hasRemote: false,
        hasConflict: false,
      }
    }
    return runOnProjectGitQueue(projectSlug, async () => {
      const worktreeDir = await worktreeManager.ensureWorktree(project.path, projectSlug, project.branch)
      const hasRemote = await taskSyncManager.hasRemote(worktreeDir)
      const hasConflict = await taskSyncManager.detectConflict(worktreeDir)
      return {
        hasRemote,
        hasConflict,
      }
    })
  }

  return {
    loadProjectPage,
    loadSyncStatus,
  }
}
