import { Show } from "solid-js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "../ui/menu";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { SwatchColumn } from "~/core/board/status-swatch.js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";
import StatusSwatch from "./StatusSwatch";
import HerdrStatusIcon from "./HerdrStatusIcon";

interface TicketCardProps {
  ticket: TicketInfo;
  orphanedStatus?: string;
  columns: SwatchColumn[];
  herdrStatus?: HerdrAgentStatus;
  onEdit: (ticket: TicketInfo) => void;
  onDelete: (ticket: TicketInfo) => void;
  onArchive: (ticket: TicketInfo) => void;
  onViewDetail: (ticket: TicketInfo) => void;
}

export default function TicketCard(props: TicketCardProps) {
  function handleCardClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-menu]")) return;
    props.onViewDetail(props.ticket);
  }

  return (
    <div
      data-drag-source
      data-testid="kanban-board-ticket-card"
      data-folder-name={props.ticket.folderName}
      class={
        "ripple cursor-pointer rounded-md border border-border bg-card "
        + "p-3 shadow-sm transition-shadow hover:shadow-md"
      }
      onClick={handleCardClick}
    >
      <div class="mb-1 flex items-start justify-between">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="text-sm font-medium text-primary">{props.ticket.number}</span>
          <StatusSwatch status={props.ticket.status} columns={props.columns} />
          <Show when={props.herdrStatus}>
            {(s) => <HerdrStatusIcon status={s()} />}
          </Show>
        </div>
        <div data-menu class="-mr-2 -mt-2">
          <MenuRoot
            trigger={
              <MenuTrigger
                class={
                  "inline-flex size-8 items-center justify-center rounded-md "
                  + "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }
                aria-label="Ticket actions"
                data-testid="kanban-board-ticket-menu-trigger"
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </MenuTrigger>
            }
          >
            <MenuContent>
              <MenuItem
                value="edit"
                data-testid="kanban-board-ticket-menu-edit"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation(); props.onEdit(props.ticket);
                }}
              >Edit</MenuItem>
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
