export interface TicketAgentWorktree {
  branchName: string
  worktreePath: string
  agentKey?: string
  removed?: boolean
  cleanupComplete?: boolean
}

export function ticketAgentKey(folderName: string, ticket: TicketWorktreeSelection, worktreePath?: string): string {
  return ticketAgentWorktrees(ticket).find((entry) => entry.worktreePath === worktreePath)?.agentKey ?? folderName
}

export interface TicketWorktreeSelection {
  agentWorktrees?: TicketAgentWorktree[]
  agentWorktreeBranchName?: string
  agentWorktreeDir?: string
}

export function ticketAgentWorktrees(ticket: TicketWorktreeSelection): TicketAgentWorktree[] {
  if (ticket.agentWorktrees) return ticket.agentWorktrees
  if (ticket.agentWorktreeBranchName && ticket.agentWorktreeDir) {
    return [
      {
        branchName: ticket.agentWorktreeBranchName,
        worktreePath: ticket.agentWorktreeDir,
      },
    ]
  }
  return []
}
