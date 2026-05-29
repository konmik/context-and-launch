// All test data is defined as plain JavaScript objects.
// No fs, path, os, or memfs imports -- purely in-memory mock data.

import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ColumnDefinition, BoardDefinition } from "~/server/project/board-config.js";
import type { BoardState } from "~/server/actions.js";
export type { TicketInfo, ColumnDefinition, BoardDefinition, BoardState };

const PROJECT_SLUG = "e2e-test";

interface BoardPageBase {
  projects: { path: string; projectSlug: string; available: boolean }[];
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

const DEFAULT_COLUMNS: ColumnDefinition[] = [{ name: "todo" }, { name: "in-progress" }, { name: "done" }];

export const DEFAULT_BOARDS: BoardDefinition[] = [
  { id: "kanban", name: "Kanban", columns: [
    { name: "todo" }, { name: "prd" }, { name: "in-progress" }, { name: "review" }, { name: "done" },
  ]},
  { id: "simple", name: "Simple", columns: [
    { name: "todo" }, { name: "in-progress" }, { name: "done" },
  ]},
];

const DEFAULT_TICKETS: TicketInfo[] = [
  {
    number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha",
    contextNames: [], useWorktree: false, fileNames: [], references: [],
  },
  {
    number: "T-2", title: "Bravo", status: "todo", folderName: "t-2-bravo",
    contextNames: [], useWorktree: false, fileNames: [], references: [],
  },
  {
    number: "T-3", title: "Charlie", status: "in-progress", folderName: "t-3-charlie",
    contextNames: [], useWorktree: false, fileNames: [], references: [],
  },
  {
    number: "T-4", title: "Delta", status: "in-progress", folderName: "t-4-delta",
    contextNames: [], useWorktree: false, fileNames: [], references: [],
  },
];

function buildTicketOrder(tickets: TicketInfo[], columns: ColumnDefinition[]): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const col of columns) {
    order[col.name] = [];
  }
  for (const t of tickets) {
    if (!order[t.status]) order[t.status] = [];
    order[t.status].push(t.folderName);
  }
  return order;
}

export function createBoardWithTickets(
  tickets: TicketInfo[], columns: ColumnDefinition[] = DEFAULT_COLUMNS,
  hasRemote = false, hasConflict = false,
): BoardPageData {
  return {
    status: 'loaded' as const,
    projects: [{ path: "/test-project", projectSlug: PROJECT_SLUG, available: true }],
    projectSlug: PROJECT_SLUG,
    board: {
      columns,
      tickets,
      ticketOrder: buildTicketOrder(tickets, columns),
    },
    projectPath: "/test-project",
    suggestedNextNumber: null,
    hasRemote,
    hasConflict,
  };
}

export const EMPTY_BOARD: BoardPageData = createBoardWithTickets([]);

export const SEEDED_BOARD: BoardPageData = createBoardWithTickets(DEFAULT_TICKETS);
