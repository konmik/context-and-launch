import type { JSX } from '@solidjs/web'
import { untrack } from 'solid-js'
import { Zap } from '~/components/ui/icons/Zap.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { MenuRoot } from '../ui/MenuRoot.js'
import { MenuTrigger } from '../ui/MenuTrigger.js'
import { MenuContent } from '../ui/MenuContent.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { openTicketFolder, openTicketWorktree } from './ticket-api.js'
import { createShortcutState } from './ticket-detail-shortcuts.js'
import { ShortcutConfirmationDialog } from './ShortcutConfirmationDialog.js'
import TicketActionItems from './TicketActionItems'

interface TicketDetailActionsProps {
  projectSlug: string
  ticket: TicketInfo
  shortcuts: {
    name: string
  }[]
  launchDir: string
  hasUnsavedChanges: boolean
  onArchive?: (ticket: TicketInfo) => void
  onDelete?: (ticket: TicketInfo) => void
  onReviewChanges?: (ticket: TicketInfo) => void
}

export default function TicketDetailActions(props: TicketDetailActionsProps): JSX.Element {
  const errors = useErrorReporter()
  const shortcutState = untrack(() =>
    createShortcutState({
      projectSlug: () => props.projectSlug,
      folderName: () => props.ticket.folderName,
      useWorktree: () => props.ticket.useWorktree,
      launchDir: () => props.launchDir,
      onError: errors.report,
      onClearError: errors.clear,
    }),
  )
  return (
    <>
      <MenuRoot
        trigger={
          <MenuTrigger class="btn-ghost-icon h-8 w-8" aria-label="Ticket actions" data-testid="ticket-detail-actions-menu-trigger">
            <Zap size={16} />
          </MenuTrigger>
        }
      >
        <MenuContent>
          <TicketActionItems
            hasAgentWorktree={props.ticket.hasAgentWorktree}
            shortcuts={props.shortcuts}
            isShortcutRunning={shortcutState.runningShortcut() !== ''}
            hasUnsavedChanges={props.hasUnsavedChanges}
            callbacks={{
              onOpenFolder: () => {
                void errors.runAndReportErrors(() => openTicketFolder(props.projectSlug, props.ticket.folderName))
              },
              onOpenWorktree: () => {
                void errors.runAndReportErrors(() => openTicketWorktree(props.projectSlug, props.ticket.folderName))
              },
              onArchive: props.onArchive ? () => props.onArchive!(props.ticket) : undefined,
              onDelete: props.onDelete ? () => props.onDelete!(props.ticket) : undefined,
              onReviewChanges: props.onReviewChanges ? () => props.onReviewChanges!(props.ticket) : undefined,
              onRunShortcut: shortcutState.runShortcut,
            }}
          />
        </MenuContent>
      </MenuRoot>
      <ShortcutConfirmationDialog
        info={shortcutState.shortcutConfirmation()}
        running={shortcutState.runningShortcut() !== ''}
        onCancel={() => shortcutState.setShortcutConfirmation(undefined)}
        onProceed={(shortcutName) => {
          shortcutState.setShortcutConfirmation(undefined)
          void shortcutState.runShortcut(shortcutName, true)
        }}
      />
    </>
  )
}
