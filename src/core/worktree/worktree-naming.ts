const MAX_WORKTREE_FOLDER_LENGTH = 50

export function worktreeFolderName(taskFolderName: string): string {
  if (taskFolderName.length <= MAX_WORKTREE_FOLDER_LENGTH) return taskFolderName
  return taskFolderName.slice(0, MAX_WORKTREE_FOLDER_LENGTH).replace(/-+$/, '')
}

export function worktreeBranchName(taskFolderName: string, branchPrefix?: string): string {
  const folder = worktreeFolderName(taskFolderName)
  return branchPrefix ? `${branchPrefix}/${folder}` : folder
}

export function worktreeInstanceName(taskFolderName: string, instanceId: string): string {
  const suffix = `-${instanceId}`
  if (suffix.length >= MAX_WORKTREE_FOLDER_LENGTH) throw new Error('Worktree identifier is too long.')
  return `${taskFolderName.slice(0, MAX_WORKTREE_FOLDER_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
}

export interface AgentWorktreeLocation {
  worktreePath: string
  branchName: string
  isDefaultLocation: boolean
}

export function resolveAgentWorktreeLocation(
  taskFolderName: string,
  settings: {
    worktreeRootPath: string
    branchPrefix?: string
  },
  saved?: {
    savedWorktreePath?: string
    savedBranchName?: string
  },
): AgentWorktreeLocation {
  const defaultPath = `${settings.worktreeRootPath}/${worktreeFolderName(taskFolderName)}`
  const worktreePath = saved?.savedWorktreePath ?? defaultPath
  return {
    worktreePath,
    isDefaultLocation: worktreePath === defaultPath,
    branchName: saved?.savedBranchName ?? worktreeBranchName(taskFolderName, settings.branchPrefix),
  }
}
