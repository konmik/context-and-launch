import { randomUUID } from 'node:crypto'
import * as v from 'valibot'
import { errorPayload, UserFacingErrorSchema } from '../shared/errors.js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import type { ConfigPaths } from '../config/config-paths.js'
import type { ConfigRepository } from '../config/config-repository.js'
import { requireSafeSlug } from '../config/config-paths.js'
import { createUpdateLock, type UpdateLock } from '~/util/update-lock.js'
import { getReviewTaskState, withReviewTaskState } from './diff-review-types.js'
import type { DiffReviewProjectState, DiffReviewTaskState, ReviewPromptQueueItem, ReviewPromptSnapshot } from './diff-review-types.js'

const PromptLineSchema = v.object({
  type: v.picklist(['context', 'addition', 'deletion']),
  text: v.string(),
  oldLineNumber: v.optional(v.number()),
  newLineNumber: v.optional(v.number()),
})

const RangeSchema = v.object({
  start: v.number(),
  end: v.number(),
})

const PromptSnapshotSchema = v.object({
  scope: v.picklist(['all', 'branch', 'working', 'last-commit']),
  filePath: v.string(),
  oldRange: v.optional(RangeSchema),
  newRange: v.optional(RangeSchema),
  selectedLines: v.array(PromptLineSchema),
  contextBefore: v.array(PromptLineSchema),
  contextAfter: v.array(PromptLineSchema),
  selectionFingerprint: v.string(),
  sourceRevision: v.string(),
})

const QueueItemBaseSchema = {
  id: v.string(),
  createdAt: v.string(),
  feedback: v.string(),
  snapshot: v.optional(PromptSnapshotSchema),
}

const QueueItemSchema = v.union([
  v.object({
    ...QueueItemBaseSchema,
    state: v.literal('waiting'),
  }),
  v.object({
    ...QueueItemBaseSchema,
    state: v.literal('delivering'),
    deliveryStartedAt: v.string(),
  }),
  v.object({
    ...QueueItemBaseSchema,
    state: v.literal('sent'),
    sentAt: v.string(),
  }),
  v.object({
    ...QueueItemBaseSchema,
    state: v.literal('error'),
    error: v.union([
      UserFacingErrorSchema,
      v.pipe(
        v.string(),
        v.transform((description) => errorPayload(description, 'Review delivery failed')),
      ),
    ]),
  }),
  v.object({
    ...QueueItemBaseSchema,
    state: v.literal('uncertain'),
    error: v.union([
      UserFacingErrorSchema,
      v.pipe(
        v.string(),
        v.transform((description) => errorPayload(description, 'Review delivery uncertain')),
      ),
    ]),
  }),
])

const QueueSchema = v.object({
  items: v.array(QueueItemSchema),
  cooldownUntil: v.optional(v.string()),
  agentLaunchReservedUntil: v.optional(v.string()),
  requestedAgentProfileName: v.optional(v.string()),
})

const TaskStateSchema = v.object({
  worktreeIdentity: v.string(),
  reviewedLines: v.record(
    v.string(),
    v.object({
      path: v.string(),
      reviewedAt: v.string(),
    }),
  ),
  queue: QueueSchema,
})

const ProjectStateSchema = v.object({
  version: v.literal(2),
  tasks: v.record(v.string(), TaskStateSchema),
  worktrees: v.optional(v.record(v.string(), v.record(v.string(), TaskStateSchema))),
})

const LegacyProjectStateSchema = v.object({
  version: v.literal(1),
  tasks: v.record(
    v.string(),
    v.object({
      worktreeIdentity: v.string(),
      queue: QueueSchema,
    }),
  ),
})

export interface DiffReviewStore {
  whenWritable<T>(projectSlug: string, write: () => T): Promise<T>
  release(projectSlug: string, owner: string): void
  loadProject(projectSlug: string, owner?: string): DiffReviewProjectState
  updateProject(
    projectSlug: string,
    transform: (current: DiffReviewProjectState) => DiffReviewProjectState,
    owner?: string,
  ): DiffReviewProjectState
  getTask(projectSlug: string, folderName: string, worktreeIdentity: string, owner?: string): DiffReviewTaskState
  enqueue(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    feedback: string,
    snapshot?: ReviewPromptSnapshot,
  ): ReviewPromptQueueItem
  retry(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState
  beginDelivery(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState
  completeDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    sentAt: Date,
    cooldownMs: number,
  ): DiffReviewTaskState
  failDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState
  failSentDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState
  markDeliveryUncertain(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState
  acknowledgeSent(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState
  reserveAgentLaunch(projectSlug: string, folderName: string, worktreeIdentity: string, reservedUntil: Date): DiffReviewTaskState
  recoverInterrupted(projectSlug: string): void
  removeTask(projectSlug: string, folderName: string, worktreeIdentity?: string): Promise<void>
  updateTask(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    update: (task: DiffReviewTaskState) => DiffReviewTaskState,
    owner?: string,
  ): DiffReviewTaskState
}

export function createDiffReviewStore(paths: ConfigPaths, repository: ConfigRepository): DiffReviewStore {
  const locks = new Map<string, UpdateLock>()

  function lock(projectSlug: string): UpdateLock {
    requireSafeSlug(projectSlug)
    let lock = locks.get(projectSlug)
    if (!lock) locks.set(projectSlug, (lock = createUpdateLock()))
    return lock
  }

  function whenWritable<T>(projectSlug: string, write: () => T): Promise<T> {
    return lock(projectSlug).writeWhenAvailable(write)
  }

  function release(projectSlug: string, owner: string): void {
    lock(projectSlug).release(owner)
  }

  function loadProject(projectSlug: string, owner?: string): DiffReviewProjectState {
    return lock(projectSlug).read(() => readProject(projectSlug), owner)
  }

  function updateProject(
    projectSlug: string,
    transform: (current: DiffReviewProjectState) => DiffReviewProjectState,
    owner?: string,
  ): DiffReviewProjectState {
    return lock(projectSlug).write(() => {
      const next = v.parse(ProjectStateSchema, transform(readProject(projectSlug)))
      repository.writeJson(paths.diffReviewStateFile(projectSlug), next)
      return next
    }, owner)
  }

  function readProject(projectSlug: string): DiffReviewProjectState {
    requireSafeSlug(projectSlug)
    const filePath = paths.diffReviewStateFile(projectSlug)
    const raw = repository.readJson(filePath)
    if (raw === null)
      return {
        version: 2,
        tasks: {},
      }
    const parsed = v.safeParse(ProjectStateSchema, raw)
    if (parsed.success) return parsed.output
    const legacy = v.safeParse(LegacyProjectStateSchema, raw)
    if (!legacy.success) {
      throw new Error(`Invalid Diff Review state in ${filePath}.`)
    }
    return {
      version: 2,
      tasks: Object.fromEntries(
        Object.entries(legacy.output.tasks).map(([folderName, task]) => [
          folderName,
          {
            ...task,
            reviewedLines: {},
          },
        ]),
      ),
    }
  }

  function getTask(projectSlug: string, folderName: string, worktreeIdentity: string, owner?: string): DiffReviewTaskState {
    requireSafeSlug(folderName)
    return getReviewTaskState(loadProject(projectSlug, owner), folderName, worktreeIdentity)
  }

  function enqueue(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    feedback: string,
    snapshot?: ReviewPromptSnapshot,
  ): ReviewPromptQueueItem {
    const normalizedFeedback = feedback.trim()
    if (!normalizedFeedback) throw new Error('Review Prompt feedback cannot be empty.')
    if (snapshot && snapshot.selectedLines.length === 0) {
      throw new Error('A Review Prompt with a Review Selection must contain lines.')
    }
    const created: ReviewPromptQueueItem = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      feedback: normalizedFeedback,
      snapshot,
      state: 'waiting',
    }
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => ({
      ...task,
      queue: {
        ...task.queue,
        items: [...task.queue.items, created],
      },
    })).queue.items.at(-1)!
  }

  function retry(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || (head.state !== 'error' && head.state !== 'sent' && head.state !== 'uncertain')) {
        throw new Error('Only a failed, uncertain, or delivered head Review Prompt can be retried.')
      }
      task.queue.items[0] = withState(head, {
        state: 'waiting',
      })
      return task
    })
  }

  function beginDelivery(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'waiting') {
        throw new Error('Review Prompt queue head changed before delivery.')
      }
      task.queue.items[0] = withState(head, {
        state: 'delivering',
        deliveryStartedAt: new Date().toISOString(),
      })
      delete task.queue.requestedAgentProfileName
      return task
    })
  }

  function completeDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    sentAt: Date,
    cooldownMs: number,
  ): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'delivering') {
        throw new Error('Review Prompt queue head changed during delivery.')
      }
      task.queue.items[0] = withState(head, {
        state: 'sent',
        sentAt: sentAt.toISOString(),
      })
      task.queue.cooldownUntil = new Date(sentAt.getTime() + cooldownMs).toISOString()
      return task
    })
  }

  function failDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'delivering') {
        throw new Error('Review Prompt queue head changed during failed delivery.')
      }
      task.queue.items[0] = withState(head, {
        state: 'error',
        error,
      })
      return task
    })
  }

  function failSentDelivery(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'sent') {
        throw new Error('Only a delivered head Review Prompt can lose its Agent.')
      }
      task.queue.items[0] = withState(head, {
        state: 'error',
        error,
      })
      return task
    })
  }

  function markDeliveryUncertain(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    itemId: string,
    error: UserFacingError,
  ): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'delivering') {
        throw new Error('Only a delivering head Review Prompt can have an uncertain outcome.')
      }
      task.queue.items[0] = withState(head, {
        state: 'uncertain',
        error,
      })
      return task
    })
  }

  function acknowledgeSent(projectSlug: string, folderName: string, worktreeIdentity: string, itemId: string): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const head = task.queue.items[0]
      if (!head || head.id !== itemId || head.state !== 'sent') {
        throw new Error('Only a delivered head Review Prompt can be acknowledged.')
      }
      task.queue.items.shift()
      return task
    })
  }

  function reserveAgentLaunch(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    reservedUntil: Date,
  ): DiffReviewTaskState {
    return updateTask(projectSlug, folderName, worktreeIdentity, (task) => {
      const existing = Date.parse(task.queue.agentLaunchReservedUntil ?? '')
      if (Number.isFinite(existing) && existing > Date.now()) {
        throw new Error('An Agent launch is already in progress for this Task.')
      }
      task.queue.agentLaunchReservedUntil = reservedUntil.toISOString()
      delete task.queue.requestedAgentProfileName
      return task
    })
  }

  function recoverInterrupted(projectSlug: string): void {
    lock(projectSlug).write(() => {
      const project = loadProject(projectSlug)
      let changed = false
      for (const task of [...Object.values(project.tasks), ...Object.values(project.worktrees ?? {}).flatMap(Object.values)]) {
        for (let index = 0; index < task.queue.items.length; index += 1) {
          const item = task.queue.items[index]
          if (item.state !== 'delivering') continue
          task.queue.items[index] = withState(item, {
            state: 'uncertain',
            error: {
              title: 'Review delivery uncertain',
              description: 'Delivery was interrupted and may have reached the Agent. Retry only if needed.',
            },
          })
          changed = true
        }
      }
      if (changed) repository.writeJson(paths.diffReviewStateFile(projectSlug), project)
    })
  }

  async function removeTask(projectSlug: string, folderName: string, worktreeIdentity?: string): Promise<void> {
    requireSafeSlug(folderName)
    await lock(projectSlug).writeWhenAvailable(() => {
      const project = loadProject(projectSlug)
      if (!worktreeIdentity || project.tasks[folderName]?.worktreeIdentity === worktreeIdentity) delete project.tasks[folderName]
      if (!worktreeIdentity) delete project.worktrees?.[folderName]
      else if (project.worktrees?.[folderName]) delete project.worktrees[folderName][worktreeIdentity]
      repository.writeJson(paths.diffReviewStateFile(projectSlug), project)
    })
  }

  function updateTask(
    projectSlug: string,
    folderName: string,
    worktreeIdentity: string,
    update: (task: DiffReviewTaskState) => DiffReviewTaskState,
    owner?: string,
  ): DiffReviewTaskState {
    requireSafeSlug(folderName)
    return updateProject(
      projectSlug,
      (project) => {
        const updated = update(getReviewTaskState(project, folderName, worktreeIdentity))
        if (updated.worktreeIdentity !== worktreeIdentity) {
          throw new Error('The Task worktree changed. Refresh Diff Review.')
        }
        return withReviewTaskState(project, folderName, updated)
      },
      owner,
    ).tasks[folderName]
  }

  function withState(
    item: ReviewPromptQueueItem,
    state:
      | {
          state: 'waiting'
        }
      | {
          state: 'delivering'
          deliveryStartedAt: string
        }
      | {
          state: 'sent'
          sentAt: string
        }
      | {
          state: 'error'
          error: UserFacingError
        }
      | {
          state: 'uncertain'
          error: UserFacingError
        },
  ): ReviewPromptQueueItem {
    return {
      id: item.id,
      createdAt: item.createdAt,
      feedback: item.feedback,
      snapshot: item.snapshot,
      ...state,
    }
  }

  return {
    whenWritable,
    release,
    loadProject,
    updateProject,
    getTask,
    enqueue,
    retry,
    beginDelivery,
    completeDelivery,
    failDelivery,
    failSentDelivery,
    markDeliveryUncertain,
    acknowledgeSent,
    reserveAgentLaunch,
    recoverInterrupted,
    removeTask,
    updateTask,
  }
}
