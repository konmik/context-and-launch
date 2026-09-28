import type { ProjectRegistry } from './project-registry.js'
import type { LauncherConfigManager } from '../launcher/launcher-config.js'
import type { WorktreeManager } from '../worktree/worktree-manager.js'
import type { BoardConfigManager } from './board-config.js'
import { createTaskStore } from '../task/task-store.js'

export type MigrationScope = 'all' | 'current' | 'none'

export interface MigrationResult {
  tasksUpdated: number
  projectsUpdated: number
}

export function migrateColumnRename(
  boardId: string,
  oldColumnName: string,
  newColumnName: string,
  scope: MigrationScope,
  currentProjectSlug: string,
  deps: {
    projectRegistry: ProjectRegistry
    launcherConfigManager: LauncherConfigManager
    worktreeManager: WorktreeManager
    boardConfigManager: BoardConfigManager
  },
): MigrationResult {
  if (scope === 'none') {
    return {
      tasksUpdated: 0,
      projectsUpdated: 0,
    }
  }
  let projectSlugs: string[]
  if (scope === 'current') {
    projectSlugs = [currentProjectSlug]
  } else {
    try {
      const defaultBoardId = deps.boardConfigManager.getDefaultBoardId()
      const projects = deps.projectRegistry.listProjects()
      projectSlugs = projects
        .filter((p) => {
          const projectBoardId = p.boardId ?? defaultBoardId
          return projectBoardId === boardId
        })
        .map((p) => p.projectSlug)
    } catch (e) {
      console.warn('Failed to list projects during column rename migration', e)
      projectSlugs = []
    }
  }
  let tasksUpdated = 0
  let projectsUpdated = 0
  for (const projectSlug of projectSlugs) {
    let worktreeDir: string
    try {
      worktreeDir = deps.worktreeManager.getWorktreeDir(projectSlug)
    } catch (e) {
      console.warn(`Skipping project "${projectSlug}" during column rename migration: worktree not resolved`, e)
      continue
    }
    let projectChanged = false
    try {
      const store = createTaskStore(worktreeDir)
      const tasks = store.listTasks()
      for (const task of tasks) {
        if (task.status === oldColumnName) {
          store.updateTask(task.folderName, null, null, newColumnName)
          tasksUpdated++
          projectChanged = true
        }
      }
    } catch (e) {
      console.warn(`Skipping task migration for project "${projectSlug}": task store inaccessible`, e)
    }
    try {
      deps.launcherConfigManager.updateProjectConfig(projectSlug, (current) => {
        if (!current.columnDefaults || !Object.hasOwn(current.columnDefaults, oldColumnName)) return current
        const { [oldColumnName]: defaults, ...remaining } = current.columnDefaults
        projectChanged = true
        return {
          ...current,
          columnDefaults: {
            ...remaining,
            [newColumnName]: defaults,
          },
        }
      })
    } catch (e) {
      console.warn(`Skipping columnDefaults re-keying for project "${projectSlug}"`, e)
    }
    if (projectChanged) {
      projectsUpdated++
    }
  }
  return {
    tasksUpdated,
    projectsUpdated,
  }
}
