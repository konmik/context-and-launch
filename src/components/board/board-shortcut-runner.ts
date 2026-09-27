import type { LauncherShortcut } from '../../core/launcher/launcher-config-data.js'
import type { SourceAccessor } from 'solid-js'
import type { ShortcutConfirmation } from '../ticket/ticket-detail-shortcuts.js'
import type { Setter } from 'solid-js'
import { createSignal, createMemo, flush } from 'solid-js'
import { createShortcutState } from '../ticket/ticket-detail-shortcuts.js'
import { openTicketWorktree } from '../ticket/ticket-api.js'
import { computeLaunchDir } from '../launcher/agent-launcher-pure.js'
import type { MergedLauncherConfigWithMeta } from '../launcher/launcher-api.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'

export function createBoardShortcutRunner(deps: {
  onError: (error: ErrorInfo) => void
  projectSlug: () => string
  config: () => MergedLauncherConfigWithMeta | undefined
}): BoardShortcutRunnerResult {
  const [activeTicket, setActiveTicket] = createSignal<TicketInfo>()
  const launchDir = createMemo(() => {
    const ticket = activeTicket()
    const config = deps.config()
    if (!ticket || !config) return ''
    return computeLaunchDir({
      useWorktree: ticket.useWorktree,
      projectPath: config.projectPath,
      worktreeRootPath: config.worktreeRootPath,
      agentWorktreeDir: config.agentWorktreeDir,
      folderName: ticket.folderName,
      savedAgentWorktreeDir: ticket.agentWorktreeDir,
    })
  })
  const shortcutState = createShortcutState({
    projectSlug: deps.projectSlug,
    folderName: () => activeTicket()?.folderName ?? '',
    useWorktree: () => activeTicket()?.useWorktree ?? false,
    launchDir,
    onError: deps.onError,
  })

  function run(ticket: TicketInfo, name: string) {
    setActiveTicket(ticket) // The shortcut command imperatively reads the ticket selected by this same event.
    flush()
    void shortcutState.runShortcut(name)
  }

  async function openWorktree(ticket: TicketInfo) {
    try {
      const result = await openTicketWorktree(deps.projectSlug(), ticket.folderName)
      if (result.type === 'Failure') deps.onError(result.error)
    } catch (e) {
      deps.onError(errorPayload(e, 'Open failed'))
    }
  }

  return {
    shortcuts: () => deps.config()?.shortcuts ?? [],
    running: shortcutState.runningShortcut,
    confirmation: shortcutState.shortcutConfirmation,
    setConfirmation: shortcutState.setShortcutConfirmation,
    proceed: (name: string) => void shortcutState.runShortcut(name, true),
    run,
    openWorktree: (ticket: TicketInfo) => void openWorktree(ticket),
  }
}

export interface BoardShortcutRunnerResult {
  shortcuts: () => (LauncherShortcut & {
    scope: 'app' | 'project'
    order: number
  })[]
  running: SourceAccessor<string>
  confirmation: SourceAccessor<ShortcutConfirmation | undefined>
  setConfirmation: Setter<ShortcutConfirmation | undefined>
  proceed: (name: string) => undefined
  run: (ticket: TicketInfo, name: string) => void
  openWorktree: (ticket: TicketInfo) => undefined
}
