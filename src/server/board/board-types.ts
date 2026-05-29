import type { ProjectInfo } from "~/server/project/project-registry.js";
import type { ColumnDefinition } from "~/server/project/board-config.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { TicketOrder } from "~/server/ticket/ticket-order.js";

export interface BoardState {
  columns: ColumnDefinition[];
  tickets: TicketInfo[];
  ticketOrder: TicketOrder;
}

interface BoardPageBase {
  projects: ProjectInfo[];
  projectSlug: string;
}

export type BoardPageData =
  | (BoardPageBase & {
      status: 'loaded'; board: BoardState; projectPath: string;
      suggestedNextNumber: string | null; hasRemote: boolean; hasConflict: boolean;
    })
  | (BoardPageBase & { status: 'not-found' })
  | (BoardPageBase & { status: 'unavailable'; projectPath: string })
  | (BoardPageBase & { status: 'error'; projectPath: string; error: string });
