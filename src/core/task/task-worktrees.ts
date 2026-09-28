export interface TaskAgentWorktree {
  branchName: string
  worktreePath: string
  agentKey?: string
  removed?: boolean
  cleanupComplete?: boolean
}

export function taskAgentKey(folderName: string, task: TaskWorktreeSelection, worktreePath?: string): string {
  return taskAgentWorktrees(task).find((entry) => entry.worktreePath === worktreePath)?.agentKey ?? folderName
}

export interface TaskWorktreeSelection {
  agentWorktrees?: TaskAgentWorktree[]
  agentWorktreeBranchName?: string
  agentWorktreeDir?: string
}

export function taskAgentWorktrees(task: TaskWorktreeSelection): TaskAgentWorktree[] {
  if (task.agentWorktrees) return task.agentWorktrees
  if (task.agentWorktreeBranchName && task.agentWorktreeDir) {
    return [
      {
        branchName: task.agentWorktreeBranchName,
        worktreePath: task.agentWorktreeDir,
      },
    ]
  }
  return []
}
