import { errorMessage } from '~/core/shared/errors.js'
import { HerdrUnavailableError } from '~/core/herdr/herdr-availability.js'
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
      if (error instanceof HerdrUnavailableError) {
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

  async function reconcile(projectSlug: string): Promise<QueueReconciliationSuccess | QueueReconciliationError> {
    try {
      await deps.reconcileProject(projectSlug)
      return {
        ok: true as const,
      }
    } catch (error) {
      deps.log('diff-review', `queue reconciliation failed: ${errorMessage(error)}`, {
        projectSlug,
      })
      return {
        ok: false as const,
        message: errorMessage(error),
      }
    }
  }

  return {
    getStatuses,
    reconcile,
  }
}

export interface AgentStatusServiceResult {
  getStatuses: (projectSlug: string) => Promise<HerdrAgentStatusesResult>
  reconcile: (projectSlug: string) => Promise<
    | {
        ok: true
        message?: undefined
      }
    | {
        ok: false
        message: string
      }
  >
}

export interface QueueReconciliationSuccess {
  ok: true
  message?: undefined
}

export interface QueueReconciliationError {
  ok: false
  message: string
}
