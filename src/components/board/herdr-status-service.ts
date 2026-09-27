import { errorMessage } from '~/core/shared/errors.js'
import { success, failure, type Result } from '~/util/result.js'
import { isHerdrUnavailableError } from '~/core/herdr/herdr-availability.js'
import type { HerdrAgentStatus, HerdrTicketState } from '~/core/herdr/herdr-client.js'

export interface DisabledAgentStatuses {
  kind: 'disabled'
}

export interface AvailableAgentStatuses {
  kind: 'available'
  statusesByFolderName: Record<string, HerdrAgentStatus>
}

export interface UnavailableAgentStatuses {
  kind: 'unavailable'
}

export type HerdrAgentStatusesResult = DisabledAgentStatuses | AvailableAgentStatuses | UnavailableAgentStatuses

export interface HerdrStatusDeps {
  loadTicketState: (projectSlug: string) => Promise<HerdrTicketState>
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
      const state = await deps.loadTicketState(projectSlug)
      return {
        kind: 'available',
        statusesByFolderName: state.statusesByFolderName,
      }
    } catch (error) {
      if (isHerdrUnavailableError(error)) {
        deps.log('herdr', `agent status unavailable: ${error.message}`)
        return error.reason === 'cli-missing'
          ? {
              kind: 'disabled',
            }
          : {
              kind: 'unavailable',
            }
      }
      deps.log('herdr', `agent status query failed: ${errorMessage(error)}`)
      return {
        kind: 'unavailable',
      }
    }
  }

  async function reconcile(projectSlug: string): Promise<Result<undefined, string>> {
    try {
      await deps.reconcileProject(projectSlug)
      return success(undefined)
    } catch (error) {
      deps.log('diff-review', `queue reconciliation failed: ${errorMessage(error)}`, {
        projectSlug,
      })
      return failure(errorMessage(error))
    }
  }

  return {
    getStatuses,
    reconcile,
  }
}

export interface AgentStatusServiceResult {
  getStatuses: (projectSlug: string) => Promise<HerdrAgentStatusesResult>
  reconcile: (projectSlug: string) => Promise<Result<undefined, string>>
}
