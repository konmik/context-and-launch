import { errorMessage, errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { success, failure, type Result } from '~/util/result.js'
import { isHerdrUnavailableError } from '~/core/herdr/herdr-availability.js'
import type { HerdrAgentStatus, HerdrTaskState } from '~/core/herdr/herdr-client.js'

export interface MissingCliAgentStatuses {
  kind: 'cli-missing'
}

export interface ServerNotRunningAgentStatuses {
  kind: 'server-not-running'
}

export interface RunningServerAgentStatuses {
  kind: 'server-running'
  statusesByFolderName: Record<string, HerdrAgentStatus>
}

export interface FailedAgentStatusQuery {
  kind: 'status-query-failed'
  error: UserFacingError
}

export type HerdrAgentStatusesResult =
  | MissingCliAgentStatuses
  | ServerNotRunningAgentStatuses
  | RunningServerAgentStatuses
  | FailedAgentStatusQuery

export interface HerdrStatusDeps {
  loadTaskState: (projectSlug: string) => Promise<HerdrTaskState>
  reconcileProject: (projectSlug: string) => Promise<void>
  log: (
    category: string,
    message: string,
    context?: {
      projectSlug: string
    },
  ) => void
}

export function createHerdrStatusService(deps: HerdrStatusDeps): AgentStatusServiceResult {
  async function getStatuses(projectSlug: string): Promise<HerdrAgentStatusesResult> {
    try {
      const state = await deps.loadTaskState(projectSlug)
      return {
        kind: 'server-running',
        statusesByFolderName: state.statusesByFolderName,
      }
    } catch (error) {
      if (isHerdrUnavailableError(error)) {
        deps.log('herdr', `agent status unavailable: ${error.message}`)
        if (error.reason === 'cli-missing') {
          return {
            kind: 'cli-missing',
          }
        }
        if (error.reason === 'server-not-running') {
          return {
            kind: 'server-not-running',
          }
        }
      }
      deps.log('herdr', `agent status query failed: ${errorMessage(error)}`)
      return {
        kind: 'status-query-failed',
        error: errorPayload(error, 'Herdr agent status query failed'),
      }
    }
  }

  async function reconcile(projectSlug: string): Promise<Result<undefined, UserFacingError>> {
    try {
      await deps.reconcileProject(projectSlug)
      return success(undefined)
    } catch (error) {
      deps.log('diff-review', `queue reconciliation failed: ${errorMessage(error)}`, {
        projectSlug,
      })
      return failure(errorPayload(error, 'Review queue reconciliation failed'))
    }
  }

  return {
    getStatuses,
    reconcile,
  }
}

export interface AgentStatusServiceResult {
  getStatuses: (projectSlug: string) => Promise<HerdrAgentStatusesResult>
  reconcile: (projectSlug: string) => Promise<Result<undefined, UserFacingError>>
}
