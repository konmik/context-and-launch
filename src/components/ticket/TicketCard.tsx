import type { JSX } from '@solidjs/web'
import { Show, useContext } from 'solid-js'
import { EllipsisVertical } from '~/components/ui/icons.js'
import { MenuRoot, MenuTrigger, MenuContent } from '../ui/menu'
import { ShortcutRunnerContext } from '../board/shortcut-runner-context.js'
import TicketActionItems from './TicketActionItems'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import HerdrStatusIcon from './HerdrStatusIcon'
import { useHerdrStatuses } from './herdr-statuses-context.js'

interface TicketCardProps {
  ticket: TicketInfo
  orphanedStatus?: string
  onDelete: (ticket: TicketInfo) => void
  onArchive: (ticket: TicketInfo) => void
  onViewDetail: (ticket: TicketInfo) => void
  onOpenFolder?: (ticket: TicketInfo) => void
  onReviewChanges?: (ticket: TicketInfo) => void
}

export default function TicketCard(props: TicketCardProps): JSX.Element {
  const herdrStatus = useHerdrStatuses()
  const shortcutRunner = useContext(ShortcutRunnerContext)

  function handleCardClick(e: MouseEvent) {
    const target = e.target
    if (target instanceof Element && target.closest('[data-menu]')) return
    props.onViewDetail(props.ticket)
  }

  return (
    <div
      data-drag-source
      data-testid="kanban-board-ticket-card"
      data-folder-name={props.ticket.folderName}
      class="ticket-card cursor-pointer rounded-md bg-card p-3 transition-colors hover:bg-accent"
      onClick={handleCardClick}
    >
      <div class="mb-1 flex items-start justify-between">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="label-mono font-medium text-primary">{props.ticket.number}</span>
          <Show when={herdrStatus(props.ticket.folderName)}>{(s) => <HerdrStatusIcon status={s()} />}</Show>
        </div>
        <div data-menu class="-mr-2 -mt-2">
          <MenuRoot
            trigger={
              <MenuTrigger
                class="btn-ghost-icon size-8"
                aria-label="Ticket actions"
                data-testid="kanban-board-ticket-menu-trigger"
                onClick={(event: MouseEvent) => event.stopPropagation()}
              >
                <EllipsisVertical size={20} />
              </MenuTrigger>
            }
          >
            <MenuContent onClick={(event) => event.stopPropagation()}>
              <TicketActionItems
                hasAgentWorktree={props.ticket.hasAgentWorktree}
                shortcuts={shortcutRunner?.shortcuts() ?? []}
                isShortcutRunning={!!shortcutRunner?.running()}
                callbacks={{
                  onOpenFolder: props.onOpenFolder ? () => props.onOpenFolder!(props.ticket) : undefined,
                  onOpenWorktree: shortcutRunner ? () => shortcutRunner.openWorktree(props.ticket) : undefined,
                  onArchive: () => props.onArchive(props.ticket),
                  onDelete: () => props.onDelete(props.ticket),
                  onReviewChanges: props.onReviewChanges ? () => props.onReviewChanges!(props.ticket) : undefined,
                  onRunShortcut: (shortcutName) => shortcutRunner?.run(props.ticket, shortcutName),
                }}
              />
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <p class="line-clamp-2 text-sm">{props.ticket.title}</p>
      {props.orphanedStatus && (
        <p class="mt-1 text-xs text-destructive" data-testid="kanban-board-ticket-orphaned-status">
          {props.orphanedStatus}
        </p>
      )}
    </div>
  )
}
