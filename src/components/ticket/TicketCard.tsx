import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "../ui/menu";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

interface TicketCardProps {
  ticket: TicketInfo;
  orphanedStatus?: string;
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
      class="ripple cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
      onClick={handleCardClick}
    >
      <div class="mb-1 flex items-start justify-between">
        <span class="text-sm font-medium text-primary">{props.ticket.number}</span>
        <div data-menu class="-mr-2 -mt-2">
          <MenuRoot
            trigger={
              <MenuTrigger
                class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Ticket actions"
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
              </MenuTrigger>
            }
          >
            <MenuContent>
              <MenuItem value="edit" onClick={(e: MouseEvent) => { e.stopPropagation(); props.onEdit(props.ticket); }}>Edit</MenuItem>
              <MenuItem value="archive" onClick={(e: MouseEvent) => { e.stopPropagation(); props.onArchive(props.ticket); }}>Archive</MenuItem>
              <MenuItem value="delete" class="text-destructive" onClick={(e: MouseEvent) => { e.stopPropagation(); props.onDelete(props.ticket); }}>Delete</MenuItem>
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <p class="line-clamp-2 text-sm">{props.ticket.title}</p>
      {props.orphanedStatus && <p class="mt-1 text-xs text-destructive" data-testid="orphaned-status">{props.orphanedStatus}</p>}
    </div>
  );
}
