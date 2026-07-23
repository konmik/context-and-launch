import { Show, For } from "solid-js";
import EllipsisVertical from "lucide-solid/icons/ellipsis-vertical";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "../ui/menu";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import HerdrStatusIcon from "./HerdrStatusIcon";
import { useHerdrStatuses } from "./herdr-statuses-context.js";
import { useShortcutRunner } from "../board/shortcut-runner-context.js";

interface TicketCardProps {
  ticket: TicketInfo;
  orphanedStatus?: string;
  onDelete: (ticket: TicketInfo) => void;
  onArchive: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
}

export default function TicketCard(props: TicketCardProps) {
  const herdrStatus = useHerdrStatuses();
  const shortcutRunner = useShortcutRunner();
  function handleCardClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-menu]")) return;
    props.onViewDetail(props.ticket);
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
          <Show when={herdrStatus(props.ticket.folderName)}>
            {(s) => <HerdrStatusIcon status={s()} />}
          </Show>
        </div>
        <div data-menu class="-mr-2 -mt-2">
          <MenuRoot
            trigger={
              <MenuTrigger
                class="btn-ghost-icon size-8"
                aria-label="Ticket actions"
                data-testid="kanban-board-ticket-menu-trigger"
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                <EllipsisVertical size={20} />
              </MenuTrigger>
            }
          >
            <MenuContent>
              <Show when={props.ticket.hasAgentWorktree && shortcutRunner}>
                <MenuItem
                  value="open-worktree"
                  data-testid="kanban-board-ticket-menu-open-worktree"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation(); shortcutRunner!.openWorktree(props.ticket);
                  }}
                >Open worktree</MenuItem>
                <MenuSeparator />
              </Show>
              <MenuItem
                value="archive"
                data-testid="kanban-board-ticket-menu-archive"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation(); props.onArchive(props.ticket);
                }}
              >Archive</MenuItem>
              <MenuItem
                value="delete"
                class="text-destructive"
                data-testid="kanban-board-ticket-menu-delete"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation(); props.onDelete(props.ticket);
                }}
              >Delete</MenuItem>
              <Show when={(shortcutRunner?.shortcuts().length ?? 0) > 0}>
                <MenuSeparator />
                <For each={shortcutRunner!.shortcuts()}>
                  {(shortcut) => (
                    <MenuItem
                      value={`shortcut-${shortcut.name}`}
                      data-testid="kanban-board-ticket-menu-shortcut"
                      data-shortcut-name={shortcut.name}
                      disabled={shortcutRunner!.running() !== ""}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        shortcutRunner!.run(props.ticket, shortcut.name);
                      }}
                    >{shortcut.name}</MenuItem>
                  )}
                </For>
              </Show>
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
  );
}
