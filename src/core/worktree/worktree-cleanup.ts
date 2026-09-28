import { createForeignWorktreeError, type AgentWorktreeManager } from './agent-worktree.js'

export interface CleanupOptions {
  deleteWorktree: boolean
  deleteLocalBranch: boolean
  deleteRemoteBranch: boolean
}

export async function cleanupWorktree(
  agentWorktreeManager: AgentWorktreeManager,
  projectPath: string,
  branchName: string,
  worktreePath: string,
  options: CleanupOptions,
  configuredBranch?: string,
): Promise<void> {
  if (options.deleteWorktree) {
    const ownership = await agentWorktreeManager.getWorktreeOwnership(projectPath, worktreePath)
    if (ownership.kind === 'different-project') {
      throw createForeignWorktreeError(worktreePath)
    }
    if (agentWorktreeManager.isGitWorktree(worktreePath)) {
      const clean = await agentWorktreeManager.isWorktreeClean(worktreePath)
      if (!clean) {
        throw new Error('Worktree has uncommitted changes. Commit or discard them before cleanup.')
      }
    }
    const busy = await agentWorktreeManager.isWorktreeBusy(worktreePath)
    if (busy) {
      throw new Error(
        'Worktree folder is in use by another process.' +
          ' Close any editors, terminals, or running programs that use this folder, then try again.',
      )
    }
  }
  if (options.deleteLocalBranch) {
    const merged = await agentWorktreeManager.isBranchMerged(projectPath, branchName, configuredBranch)
    if (!merged) {
      throw new Error(`Branch '${branchName}' has unmerged commits.` + ' Merge or force-delete the branch before cleanup.')
    }
  }
  if (options.deleteRemoteBranch) {
    const exists = await agentWorktreeManager.hasRemoteBranch(projectPath, branchName)
    if (!exists) {
      throw new Error(`Remote branch ${branchName} does not exist.`)
    }
  }
  if (options.deleteWorktree) {
    await agentWorktreeManager.removeWorktree(projectPath, worktreePath)
  }
  if (options.deleteLocalBranch) {
    await agentWorktreeManager.deleteLocalBranch(projectPath, branchName, configuredBranch)
  }
  if (options.deleteRemoteBranch) {
    await agentWorktreeManager.deleteRemoteBranch(projectPath, branchName)
  }
}
