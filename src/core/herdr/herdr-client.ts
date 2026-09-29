import type { HerdrAgent, HerdrExecFn } from './herdr-exec.js'
import { listHerdrTaskPaneState, type HerdrTaskPane } from './herdr-task-panes.js'

export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

export interface TaskAgentStatuses extends Record<string, HerdrAgentStatus> {}

function herdrAgentStatus(status: string): HerdrAgentStatus {
  switch (status) {
    case 'idle':
    case 'working':
    case 'blocked':
    case 'done':
      return status
    default:
      return 'unknown'
  }
}

export function taskStatusesFromPanes(panes: HerdrTaskPane[]): TaskAgentStatuses {
  const statuses = new Map<string, HerdrAgentStatus>()
  const seenFolderNames = new Set<string>()
  for (const pane of panes) {
    if (seenFolderNames.has(pane.folderName)) {
      statuses.set(pane.folderName, 'unknown')
      continue
    }
    seenFolderNames.add(pane.folderName)
    if (pane.agentStatuses.length === 0) continue
    statuses.set(pane.folderName, pane.agentStatuses.length === 1 ? herdrAgentStatus(pane.agentStatuses[0]) : 'unknown')
  }
  const priority: HerdrAgentStatus[] = ['unknown', 'idle', 'done', 'working', 'blocked']
  for (const [agentKey, status] of statuses) {
    const separator = agentKey.lastIndexOf('--worktree-')
    if (separator < 0) continue
    const folderName = agentKey.slice(0, separator)
    const previous = statuses.get(folderName)
    if (!previous || priority.indexOf(status) > priority.indexOf(previous)) statuses.set(folderName, status)
  }
  return Object.fromEntries(statuses)
}

export interface HerdrTaskState {
  statusesByFolderName: TaskAgentStatuses
  agents: HerdrAgent[]
}

export async function fetchHerdrTaskState(projectSlug: string, exec: HerdrExecFn): Promise<HerdrTaskState> {
  const { taskPanes, agents } = await listHerdrTaskPaneState(projectSlug, exec)
  return {
    statusesByFolderName: taskStatusesFromPanes(taskPanes),
    agents,
  }
}
