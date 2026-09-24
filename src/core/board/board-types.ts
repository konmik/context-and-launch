import type { ProjectInfo } from "~/core/project/project-registry.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { TicketOrder } from "~/core/ticket/ticket-order.js";

export interface BoardState {
  columns: ColumnDefinition[];
  tickets: TicketInfo[];
  ticketOrder: TicketOrder;
}

interface BoardPageBase {
  projects: ProjectInfo[];
  projectSlug: string;
}

export interface SyncStatus {
  hasRemote: boolean;
  hasConflict: boolean;
}

export type ProjectPageData =
  | (BoardPageBase & {
      status: 'loaded'; board: Omit<BoardState, 'columns'>; projectPath: string;
      suggestedNextNumber: string | null;
    })
  | (BoardPageBase & { status: 'not-found' })
  | (BoardPageBase & { status: 'unavailable'; projectPath: string })
  | (BoardPageBase & { status: 'error'; projectPath: string; error: string });
