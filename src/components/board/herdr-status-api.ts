import type { Result } from '~/util/result.js'
import { failure, success } from '~/util/result.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { errorPayload } from '~/core/shared/errors.js'
import { query } from '@solidjs/router'
import { herdrExec, reviewPromptQueueService, diffReviewStore } from '~/core/config/instances.js'
import { appLog } from '~/core/infra/app-logger.js'
import { fetchHerdrTaskState } from '~/core/herdr/herdr-client.js'
import type { DiffReviewTaskState } from '~/core/diff-review/diff-review-types.js'
import { createHerdrStatusService, type HerdrAgentStatusesResult } from './herdr-status-service.js'

export type { HerdrAgentStatusesResult }

const herdrStatusService = createHerdrStatusService({
  loadTaskState: (projectSlug) => fetchHerdrTaskState(projectSlug, herdrExec),
  reconcileProject: (projectSlug) => reviewPromptQueueService.reconcileProject(projectSlug),
  log: appLog,
})

export const getHerdrAgentStatuses = query(async (projectSlug: string): Promise<HerdrAgentStatusesResult> => {
  'use server'

  return herdrStatusService.getStatuses(projectSlug)
}, 'herdr-agent-statuses')

export interface ReviewDeliveryFailure {
  folderName: string
  itemId: string
  error: UserFacingError
}

export async function reconcileReviewPromptQueue(projectSlug: string): Promise<Result<ReviewDeliveryFailure[], UserFacingError>> {
  'use server'

  const result = await herdrStatusService.reconcile(projectSlug)
  if (result.type === 'Failure') return result
  try {
    const failures: ReviewDeliveryFailure[] = []
    const project = diffReviewStore.loadProject(projectSlug)
    const taskStates: [string, DiffReviewTaskState][] = [
      ...Object.entries(project.tasks),
      ...Object.entries(project.worktrees ?? {}).flatMap(([folderName, worktrees]) =>
        Object.values(worktrees).map((task): [string, DiffReviewTaskState] => [folderName, task]),
      ),
    ]
    for (const [folderName, task] of taskStates) {
      for (const item of task.queue.items) {
        if (item.state === 'error' || item.state === 'uncertain')
          failures.push({
            folderName,
            itemId: item.id,
            error: item.error,
          })
      }
    }
    return success(failures)
  } catch (error) {
    return failure(errorPayload(error, 'Load review delivery status failed'))
  }
}
