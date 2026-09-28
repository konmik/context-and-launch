import type { ReviewPromptFreshness } from './review-prompt-text.js'
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js'
import type { HerdrAgent } from '../herdr/herdr-exec.js'
import { agentBelongsToTarget } from '../herdr/herdr-control.js'
import { appLog } from '../infra/app-logger.js'
import { errorMessage, errorPayload } from '../shared/errors.js'
import { reviewSelectionStillExists } from './diff-review-model.js'
import { renderReviewPrompt } from './review-prompt-text.js'
import type { DiffReviewGitService } from './diff-review-git.js'
import type { DiffReviewStore } from './diff-review-store.js'
import type { DiffReviewTargetResolver, ResolvedDiffReviewTarget } from './diff-review-target.js'
import type { ReviewAgentLauncher } from './review-agent-launcher.js'
import type { DiffReviewTicketState, ReviewPromptQueueItem, ReviewPromptSnapshot } from './diff-review-types.js'

const DELIVERY_COOLDOWN_MS = 3000

const AGENT_STARTUP_COOLDOWN_MS = 45000

function ticketKey(projectSlug: string, folderName: string): string {
  return `${projectSlug}\0${folderName}`
}

function headNotWaitingMessage(state: ReviewPromptQueueItem['state']): string {
  if (state === 'error' || state === 'uncertain') {
    return 'The first Review Prompt failed to deliver. Retry it, then start the Agent.'
  }
  return state === 'sent'
    ? 'The first Review Prompt is with an Agent. Retry it to send it again.'
    : 'The first Review Prompt is already on its way to an Agent.'
}

function agentMatchesTarget(agent: HerdrAgent, target: ResolvedDiffReviewTarget): boolean {
  return agentBelongsToTarget(agent, {
    projectSlug: target.projectSlug,
    folderName: target.folderName,
    agentWorktreePath: target.worktreePath,
  })
}

/** An Agent that has finished what it was given and can take the next prompt. */
function agentIsFree(agent: HerdrAgent): boolean {
  return agent.agent_status === 'idle' || agent.agent_status === 'done'
}

interface ManagedTicketAgentObservation {
  kind: 'herdr'
  agent: HerdrAgent
}

interface ProfileTicketAgentObservation {
  kind: 'profile'
}

interface AbsentTicketAgentObservation {
  kind: 'absent'
}

interface AmbiguousTicketAgentObservation {
  kind: 'ambiguous'
}

type TicketAgentObservation =
  | ManagedTicketAgentObservation
  | ProfileTicketAgentObservation
  | AbsentTicketAgentObservation
  | AmbiguousTicketAgentObservation

export interface ReviewPromptQueueService {
  reconcileProject(
    projectSlug: string,
    observation?:
      | HerdrAgent[]
      | {
          agents: HerdrAgent[]
          observedAt: number
        },
  ): Promise<void>
  isAgentRunning(projectSlug: string, folderName: string): boolean
  launchWithQueueHead(projectSlug: string, folderName: string, profileName: string): Promise<void>
  enqueueAndLaunch(
    projectSlug: string,
    folderName: string,
    feedback: string,
    snapshot: ReviewPromptSnapshot | undefined,
    profileName?: string,
  ): Promise<ReviewPromptQueueItem>
  retryAndLaunch(projectSlug: string, folderName: string, itemId: string, profileName?: string): Promise<void>
}

export function createReviewPromptQueueService(
  store: DiffReviewStore,
  git: DiffReviewGitService,
  targets: DiffReviewTargetResolver,
  commands: CommandTemplateExecutor,
  launcher: ReviewAgentLauncher,
  observeProject?: (projectSlug: string) => Promise<
    | {
        agents: HerdrAgent[]
        observedAt: number
      }
    | undefined
  >,
): ReviewPromptQueueService {
  const recoveredProjects = new Set<string>()
  const processingTickets = new Map<string, Promise<void>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const agentSnapshots = new Map<
    string,
    {
      agents: HerdrAgent[]
      readAt: number
    }
  >()

  async function reconcileProject(
    projectSlug: string,
    observation?:
      | HerdrAgent[]
      | {
          agents: HerdrAgent[]
          observedAt: number
        },
  ): Promise<void> {
    if (!recoveredProjects.has(projectSlug)) {
      await store.whenWritable(projectSlug, () => store.recoverInterrupted(projectSlug))
      recoveredProjects.add(projectSlug)
    }
    const observed = Array.isArray(observation)
      ? {
          agents: observation,
          observedAt: Date.now(),
        }
      : (observation ?? (await observeProject?.(projectSlug)))
    if (!observed) return
    const snapshot = {
      agents: observed.agents,
      readAt: observed.observedAt,
    }
    agentSnapshots.set(projectSlug, snapshot)
    const pending: Promise<void>[] = []
    const state = store.loadProject(projectSlug)
    for (const [folderName, ticketState] of Object.entries(state.tickets)) {
      if (ticketState.queue.items.length === 0) continue
      pending.push(processTicketIsolated(projectSlug, folderName, snapshot))
    }
    await Promise.all(pending)
  }

  function isAgentRunning(projectSlug: string, folderName: string): boolean {
    const target = targets.resolve(projectSlug, folderName)
    const ticket = store.getTicket(projectSlug, folderName, target.worktreeIdentity)
    return agentRunningFor(target) || launchReserved(ticket)
  }

  function agentRunningFor(target: ResolvedDiffReviewTarget): boolean {
    return observeTicketAgent(target, agentSnapshots.get(target.projectSlug)?.agents ?? []).kind !== 'absent'
  }

  function observeTicketAgent(target: ResolvedDiffReviewTarget, agents: HerdrAgent[]): TicketAgentObservation {
    const matching = agents.filter((agent) => agentMatchesTarget(agent, target))
    if (matching.length > 1)
      return {
        kind: 'ambiguous',
      }
    if (matching[0])
      return {
        kind: 'herdr',
        agent: matching[0],
      }
    return launcher.isRunning(target)
      ? {
          kind: 'profile',
        }
      : {
          kind: 'absent',
        }
  }

  async function launchWithQueueHead(projectSlug: string, folderName: string, profileName: string): Promise<void> {
    await withTicketLock(projectSlug, folderName, async () => {
      if (!(await refreshAgentSnapshot(projectSlug))) {
        throw new Error('Herdr is unavailable, so another Agent cannot be ruled out.')
      }
      await launchWithQueueHeadLocked(projectSlug, folderName, profileName)
    })
  }

  async function enqueueAndLaunch(
    projectSlug: string,
    folderName: string,
    feedback: string,
    snapshot: ReviewPromptSnapshot | undefined,
    profileName?: string,
  ): Promise<ReviewPromptQueueItem> {
    return withTicketLock(projectSlug, folderName, async () => {
      const target = targets.resolve(projectSlug, folderName)
      const agentsKnown = await refreshAgentSnapshot(projectSlug)
      const item = await store.whenWritable(projectSlug, () =>
        store.enqueue(projectSlug, folderName, target.worktreeIdentity, feedback, snapshot),
      )
      if (profileName && (!agentsKnown || !agentRunningFor(target))) {
        await requestAgentLaunchLocked(target, profileName, agentsKnown)
      }
      return item
    })
  }

  async function retryAndLaunch(projectSlug: string, folderName: string, itemId: string, profileName?: string): Promise<void> {
    await withTicketLock(projectSlug, folderName, async () => {
      const target = targets.resolve(projectSlug, folderName)
      const agentsKnown = await refreshAgentSnapshot(projectSlug)
      await store.whenWritable(projectSlug, () => store.retry(projectSlug, folderName, target.worktreeIdentity, itemId))
      if (profileName && (!agentsKnown || !agentRunningFor(target))) {
        await requestAgentLaunchLocked(target, profileName, agentsKnown)
      }
    })
  }

  async function requestAgentLaunchLocked(target: ResolvedDiffReviewTarget, profileName: string, agentsKnown: boolean): Promise<void> {
    const current = store.getTicket(target.projectSlug, target.folderName, target.worktreeIdentity)
    if (current.queue.items[0]?.state !== 'waiting' || launchReserved(current)) return
    if (!profileName.trim()) throw new Error('An Agent launch requires a profile.')
    const ticket = await store.whenWritable(target.projectSlug, () =>
      store.updateTicket(target.projectSlug, target.folderName, target.worktreeIdentity, (ticket) => ({
        ...ticket,
        queue: {
          ...ticket.queue,
          requestedAgentProfileName: profileName,
        },
      })),
    )
    if (!agentsKnown) return
    const cooldownRemaining = cooldownRemainingMs(ticket)
    if (cooldownRemaining > 0) {
      const key = ticketKey(target.projectSlug, target.folderName)
      scheduleTicket(`${key}:cooldown`, cooldownRemaining, target.projectSlug, target.folderName)
      return
    }
    await launchWithQueueHeadLocked(target.projectSlug, target.folderName, profileName)
  }

  async function refreshAgentSnapshot(projectSlug: string): Promise<boolean> {
    if (!observeProject) return true
    const observation = await observeProject(projectSlug)
    if (!observation) return false
    agentSnapshots.set(projectSlug, {
      agents: observation.agents,
      readAt: observation.observedAt,
    })
    return true
  }

  async function launchWithQueueHeadLocked(projectSlug: string, folderName: string, profileName: string): Promise<void> {
    const target = targets.resolve(projectSlug, folderName)
    const ticket = store.getTicket(projectSlug, folderName, target.worktreeIdentity)
    const head = ticket.queue.items[0]
    if (head && head.state !== 'waiting') throw new Error(headNotWaitingMessage(head.state))
    if (agentRunningFor(target)) {
      throw new Error(
        'An Agent for this Ticket is already running. Close it first, or wait' +
          ' for Herdr to report it free so the Review Prompt Queue can reach it.',
      )
    }
    if (launchReserved(ticket) || cooldownRemainingMs(ticket) > 0) {
      throw new Error(
        'An Agent for this Ticket was just started. Wait for it to come up: the' +
          ' Review Prompt Queue hands it the next Review Prompt on its own.',
      )
    }
    if (head) {
      await deliver(target, head, {
        send: (prompt) => launcher.launch(target, prompt, profileName),
        cooldownMs: AGENT_STARTUP_COOLDOWN_MS,
      })
      return
    }
    const reservedUntil = new Date(Date.now() + AGENT_STARTUP_COOLDOWN_MS)
    await store.whenWritable(projectSlug, () => store.reserveAgentLaunch(projectSlug, folderName, target.worktreeIdentity, reservedUntil))
    try {
      await launcher.launch(target, '', profileName)
    } catch (error) {
      await store.whenWritable(projectSlug, () =>
        store.updateTicket(projectSlug, folderName, target.worktreeIdentity, (ticket) => ({
          ...ticket,
          queue: {
            ...ticket.queue,
            agentLaunchReservedUntil: undefined,
          },
        })),
      )
      throw error
    }
    await store.whenWritable(projectSlug, () =>
      store.updateTicket(projectSlug, folderName, target.worktreeIdentity, (ticket) => ({
        ...ticket,
        queue: {
          ...ticket.queue,
          agentLaunchReservedUntil: undefined,
          cooldownUntil: reservedUntil.toISOString(),
        },
      })),
    )
  }

  async function withTicketLock<T>(projectSlug: string, folderName: string, run: () => Promise<T>): Promise<T> {
    const processingKey = ticketKey(projectSlug, folderName)
    while (processingTickets.has(processingKey)) {
      await processingTickets.get(processingKey)
    }
    let finish!: () => void
    processingTickets.set(
      processingKey,
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    try {
      return await run()
    } finally {
      processingTickets.delete(processingKey)
      finish()
    }
  }

  async function processTicket(projectSlug: string, folderName: string, agents: HerdrAgent[], agentsReadAt: number): Promise<void> {
    const processingKey = ticketKey(projectSlug, folderName)
    if (processingTickets.has(processingKey)) return
    await withTicketLock(projectSlug, folderName, async () => {
      let target: ResolvedDiffReviewTarget
      try {
        target = targets.resolve(projectSlug, folderName)
      } catch (error) {
        appLog('diff-review', `queue target unavailable: ${errorMessage(error)}`, {
          projectSlug,
          ticketFolderName: folderName,
        })
        return
      }
      const ticket = store.getTicket(projectSlug, folderName, target.worktreeIdentity)
      const head = ticket.queue.items[0]
      if (!head) return
      if (head.state !== 'waiting' && head.state !== 'sent') return
      const agent = observeTicketAgent(target, agents) // A delivered Review Prompt stays at the head of the queue for as long as
      // the Agent works on it, so the queue shows what the Agent is running and
      // hands over the next Review Prompt only once the Agent is free again. Only
      // an Agent report read after the delivery can say that: an older one still
      // describes the Agent as it was before it received the prompt.
      if (head.state === 'sent') {
        const sentAt = Date.parse(head.sentAt)
        if (!Number.isFinite(sentAt)) {
          throw new Error('A delivered Review Prompt carries no delivery time.')
        }
        if (agentsReadAt <= sentAt) return
        if (agent.kind === 'absent') {
          await store.whenWritable(projectSlug, () =>
            store.failSentDelivery(projectSlug, folderName, target.worktreeIdentity, head.id, {
              title: 'Review delivery failed',
              description: 'The Agent that received this Review Prompt is no longer running.' + ' Retry it if the work was not completed.',
            }),
          )
          return
        }
        if (agent.kind !== 'herdr' || !agentIsFree(agent.agent)) return
        await store.whenWritable(projectSlug, () => store.acknowledgeSent(projectSlug, folderName, target.worktreeIdentity, head.id))
        scheduleTicket(`${processingKey}:advance`, 0, projectSlug, folderName)
        return
      }
      const cooldownRemaining = cooldownRemainingMs(ticket)
      if (cooldownRemaining > 0) {
        scheduleTicket(`${processingKey}:cooldown`, cooldownRemaining, projectSlug, folderName)
        return
      }
      if (agent.kind === 'absent' && ticket.queue.requestedAgentProfileName) {
        const profileName = ticket.queue.requestedAgentProfileName
        await launchWithQueueHeadLocked(projectSlug, folderName, profileName)
        return
      }
      if (agent.kind !== 'absent' && ticket.queue.requestedAgentProfileName) {
        await store.whenWritable(projectSlug, () =>
          store.updateTicket(projectSlug, folderName, target.worktreeIdentity, (ticket) => ({
            ...ticket,
            queue: {
              ...ticket.queue,
              requestedAgentProfileName: undefined,
            },
          })),
        )
      } // Starting an Agent opens a terminal on the user's machine, so only the
      // user starts one. With no Herdr Agent to deliver to, the Review Prompt
      // keeps its place and waits for one.
      if (agent.kind !== 'herdr') return
      if (!agent.agent.pane_id) return
      if (!agentIsFree(agent.agent)) return
      const paneId = agent.agent.pane_id
      await deliver(target, head, {
        send: (prompt) =>
          commands
            .execute('herdr.review-prompt.deliver', target.worktreePath, {
              paneId,
              prompt,
            })
            .then(() => undefined),
        cooldownMs: DELIVERY_COOLDOWN_MS,
      })
    })
  }

  async function processTicketIsolated(
    projectSlug: string,
    folderName: string,
    snapshot: {
      agents: HerdrAgent[]
      readAt: number
    },
  ): Promise<void> {
    try {
      await processTicket(projectSlug, folderName, snapshot.agents, snapshot.readAt)
    } catch (error) {
      appLog('diff-review', `queue processing failed: ${errorMessage(error)}`, {
        projectSlug,
        ticketFolderName: folderName,
      })
    }
  }

  function cooldownRemainingMs(ticket: DiffReviewTicketState): number {
    const cooldown = Date.parse(ticket.queue.cooldownUntil ?? '')
    if (!Number.isFinite(cooldown)) return 0
    return Math.max(0, cooldown - Date.now())
  }

  function launchReserved(ticket: DiffReviewTicketState): boolean {
    const reservedUntil = Date.parse(ticket.queue.agentLaunchReservedUntil ?? '')
    return Number.isFinite(reservedUntil) && reservedUntil > Date.now()
  }

  async function deliver(
    target: ResolvedDiffReviewTarget,
    item: ReviewPromptQueueItem,
    delivery: {
      send(prompt: string): Promise<void>
      cooldownMs: number
    },
  ): Promise<void> {
    await store.whenWritable(target.projectSlug, () =>
      store.beginDelivery(target.projectSlug, target.folderName, target.worktreeIdentity, item.id),
    )
    try {
      const freshness = item.snapshot
        ? await checkFreshness(target, item.snapshot)
        : {
            stale: false,
          }
      await delivery.send(renderReviewPrompt(item, freshness))
    } catch (error) {
      await store.whenWritable(target.projectSlug, () =>
        store.failDelivery(
          target.projectSlug,
          target.folderName,
          target.worktreeIdentity,
          item.id,
          errorPayload(error, 'Review delivery failed'),
        ),
      )
      return
    }
    const sentAt = new Date()
    try {
      await store.whenWritable(target.projectSlug, () =>
        store.completeDelivery(target.projectSlug, target.folderName, target.worktreeIdentity, item.id, sentAt, delivery.cooldownMs),
      )
    } catch (error) {
      await store.whenWritable(target.projectSlug, () =>
        store.markDeliveryUncertain(target.projectSlug, target.folderName, target.worktreeIdentity, item.id, {
          title: 'Review delivery uncertain',
          description: 'The Agent accepted this Review Prompt, but its queue state could not be saved.',
          details: errorMessage(error),
        }),
      )
      return
    }
    const key = ticketKey(target.projectSlug, target.folderName)
    scheduleTicket(`${key}:cooldown`, delivery.cooldownMs, target.projectSlug, target.folderName)
  }

  async function checkFreshness(target: ResolvedDiffReviewTarget, snapshot: ReviewPromptSnapshot): Promise<ReviewPromptFreshness> {
    try {
      const current = await git.loadSnapshot(target, snapshot.scope)
      const file = current.files.find((candidate) => candidate.path === snapshot.filePath)
      return {
        stale: !reviewSelectionStillExists(file, snapshot),
      }
    } catch (error) {
      return {
        stale: false,
        verificationError: errorMessage(error),
      }
    }
  }

  function schedule(key: string, delayMs: number, task: () => Promise<void>): void {
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(
      () => {
        timers.delete(key)
        void task().catch((cause: unknown) => {
          appLog('diff-review', `scheduled queue processing failed: ${errorMessage(cause)}`)
        })
      },
      Math.max(0, delayMs),
    )
    timers.set(key, timer)
  }

  function scheduleTicket(key: string, delayMs: number, projectSlug: string, folderName: string): void {
    schedule(key, delayMs, async () => {
      if (observeProject) {
        await reconcileProject(projectSlug)
        return
      }
      const snapshot = agentSnapshots.get(projectSlug)
      if (!snapshot) return
      await processTicketIsolated(projectSlug, folderName, snapshot)
    })
  }

  return {
    reconcileProject,
    isAgentRunning,
    launchWithQueueHead,
    enqueueAndLaunch,
    retryAndLaunch,
  }
}
