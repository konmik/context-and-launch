import fs from 'fs'
import { createTicketStore } from '~/core/ticket/ticket-store.js'
import { resolveAgentWorktreeLocation, worktreeFolderName } from '~/core/worktree/worktree-naming.js'
import { errorMessage } from '~/core/shared/errors.js'
import type { ProjectRegistry } from '~/core/project/project-registry.js'
import type { BoardConfigManager } from '~/core/project/board-config.js'
import type { WorktreeManager } from '~/core/worktree/worktree-manager.js'
import type { LauncherConfigManager } from '~/core/launcher/launcher-config.js'
import type { FileWatcher } from '~/core/infra/file-watcher.js'
import type { TicketSyncManager } from '~/core/ticket/ticket-sync.js'
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
  ticketSyncManager: TicketSyncManager,
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
        await ticketSyncManager.finalizeResolution(worktreeDir)
        const config = boardConfigManager.getConfig(project.boardId)
        const store = createTicketStore(worktreeDir)
        const { tickets, ticketOrder, suggestedNextNumber } = await store.loadBoardSnapshot(config.columns.map((c) => c.name))
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
        const ticketsWithWorktrees = tickets.map((ticket) => {
          const { worktreePath, isDefaultLocation } = resolveAgentWorktreeLocation(ticket.folderName, worktreeSettings, {
            savedWorktreePath: ticket.agentWorktreeDir,
          })
          const hasAgentWorktree = isDefaultLocation
            ? worktreeNames.has(worktreeFolderName(ticket.folderName))
            : fs.existsSync(worktreePath)
          return {
            ...ticket,
            hasAgentWorktree,
          }
        })
        return {
          status: 'loaded' as const,
          projects,
          projectSlug,
          board: {
            tickets: ticketsWithWorktrees,
            ticketOrder,
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
        error: errorMessage(e),
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
      const hasRemote = await ticketSyncManager.hasRemote(worktreeDir)
      const hasConflict = await ticketSyncManager.detectConflict(worktreeDir)
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
