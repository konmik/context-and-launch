import type { Result } from '../../util/result.js'
import { GET } from '@solidjs/web/server-functions'
import { diffReviewStore, diffReviewTargetResolver, reviewPromptQueueService } from '~/core/config/instances.js'
import type { DiffReviewProjectState } from '~/core/diff-review/diff-review-types.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { failure, success } from '~/util/result.js'

export const readReviewAgentStatus = GET(async (projectSlug: string, folderName: string, worktreePath: string | null = null) => {
  'use server'

  return {
    worktreeIdentity: diffReviewTargetResolver.resolve(projectSlug, folderName, worktreePath ?? undefined).worktreeIdentity,
    agentRunning: reviewPromptQueueService.isAgentRunning(projectSlug, folderName, worktreePath ?? undefined),
  }
})

export const readDiffReviewState = GET(async (projectSlug: string, owner?: string) => {
  'use server'

  try {
    return success(diffReviewStore.loadProject(projectSlug, owner))
  } catch (error) {
    return failure(errorPayload(error, 'Load review state failed'))
  }
})

export async function saveDiffReviewState(
  projectSlug: string,
  json: string,
  owner: string,
): Promise<Result<DiffReviewProjectState, UserFacingError>> {
  'use server'

  try {
    if (!owner)
      return failure({
        title: 'Save failed',
        description: 'Configuration update requires a client identity.',
      })
    return success(
      diffReviewStore.updateProject(
        projectSlug,
        (current) => {
          const next: DiffReviewProjectState = JSON.parse(json)
          for (const [folderName, task] of Object.entries(next.tasks)) {
            if (JSON.stringify(task) === JSON.stringify(current.tasks[folderName])) continue
            const target = diffReviewTargetResolver.resolve(projectSlug, folderName, task.worktreeIdentity)
            if (task.worktreeIdentity !== target.worktreeIdentity) {
              throw new Error('The Task worktree changed. Refresh Diff Review.')
            }
          }
          return next
        },
        owner,
      ),
    )
  } catch (error) {
    return failure(errorPayload(error, 'Save review state failed'))
  }
}

export async function releaseDiffReviewState(projectSlug: string, owner: string) {
  'use server'

  diffReviewStore.release(projectSlug, owner)
}
