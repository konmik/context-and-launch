import fs from 'node:fs'
import path from 'node:path'
import type { ProjectRegistry } from '../project/project-registry.js'
import type { WorktreeManager } from '../worktree/worktree-manager.js'
import type { LauncherConfigManager } from '../launcher/launcher-config.js'
import { createTaskStore, type TaskInfo } from '../task/task-store.js'
import { resolveAgentWorktreeLocation } from '../worktree/worktree-naming.js'
import { createNotFoundError } from '../shared/errors.js'
import type { DiffReviewTarget } from './diff-review-git.js'
import { taskAgentWorktrees } from '../task/task-worktrees.js'

export interface ResolvedDiffReviewTarget extends DiffReviewTarget {
  projectSlug: string
  folderName: string
  branchName: string
  task: TaskInfo
}

function normalizeIdentityPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function diffReviewWorktreeIdentity(worktreePath: string, branchName: string): string {
  return `${normalizeIdentityPath(worktreePath)}\0${branchName}`
}

export interface DiffReviewTargetResolver {
  resolve(projectSlug: string, folderName: string, worktreePathOrIdentity?: string): ResolvedDiffReviewTarget
}

export function createDiffReviewTargetResolver(
  projectRegistry: ProjectRegistry,
  worktreeManager: WorktreeManager,
  launcherConfigManager: LauncherConfigManager,
): DiffReviewTargetResolver {
  function resolve(projectSlug: string, folderName: string, worktreePathOrIdentity?: string): ResolvedDiffReviewTarget {
    const project = projectRegistry.listProjects().find((candidate) => candidate.projectSlug === projectSlug)
    if (!project) throw createNotFoundError(`Project not found: ${projectSlug}`)
    const task = createTaskStore(worktreeManager.getWorktreeDir(projectSlug)).getTask(folderName)
    if (!task) throw createNotFoundError(`Task not found: ${folderName}`)
    const selected = worktreePathOrIdentity
      ? taskAgentWorktrees(task).find(
          (entry) =>
            entry.worktreePath === worktreePathOrIdentity ||
            diffReviewWorktreeIdentity(entry.worktreePath, entry.branchName) === worktreePathOrIdentity,
        )
      : undefined
    const location = resolveAgentWorktreeLocation(folderName, launcherConfigManager.resolveWorktreeSettings(projectSlug), {
      savedWorktreePath: selected?.worktreePath ?? task.agentWorktreeDir,
      savedBranchName: selected?.branchName ?? task.agentWorktreeBranchName,
    })
    if (
      worktreePathOrIdentity &&
      location.worktreePath !== worktreePathOrIdentity &&
      diffReviewWorktreeIdentity(location.worktreePath, location.branchName) !== worktreePathOrIdentity
    ) {
      throw createNotFoundError('The requested worktree no longer belongs to this task.')
    }
    if (!fs.existsSync(location.worktreePath)) {
      throw createNotFoundError(`Agent Worktree does not exist: ${location.worktreePath}`)
    }
    return {
      projectSlug,
      folderName,
      task,
      worktreePath: location.worktreePath,
      branchName: location.branchName,
      mainBranch: project.mainBranch,
      worktreeIdentity: diffReviewWorktreeIdentity(location.worktreePath, location.branchName),
    }
  }

  return {
    resolve,
  }
}
