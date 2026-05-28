// All test data is defined as plain JavaScript objects.
// No fs, path, os, or memfs imports -- purely in-memory mock data.

import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ColumnDefinition, BoardDefinition } from "~/server/project/board-config.js";
import type { BoardState } from "~/server/actions.js";
export type { TicketInfo, ColumnDefinition, BoardDefinition, BoardState };

const SLUG = "e2e-test";

export interface BoardPageData {
  projects: { path: string; slug: string; available: boolean }[];
  slug: string;
  board: BoardState | null;
  projectUnavailable: boolean;
  projectNotFound: boolean;
  projectPath: string;
  suggestedNextNumber?: string | null;
  hasRemote: boolean;
  hasConflict: boolean;
  error?: string;
}

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
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", contextNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-2", title: "Bravo", status: "todo", folderName: "t-2-bravo", contextNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-3", title: "Charlie", status: "in-progress", folderName: "t-3-charlie", contextNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-4", title: "Delta", status: "in-progress", folderName: "t-4-delta", contextNames: [], useWorktree: false, fileNames: [], references: [] },
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

export function createBoardWithTickets(tickets: TicketInfo[], columns: ColumnDefinition[] = DEFAULT_COLUMNS, hasRemote = false, hasConflict = false): BoardPageData {
  return {
    projects: [{ path: "/test-project", slug: SLUG, available: true }],
    slug: SLUG,
    board: {
      columns,
      tickets,
      ticketOrder: buildTicketOrder(tickets, columns),
    },
    projectUnavailable: false,
    projectNotFound: false,
    projectPath: "/test-project",
    hasRemote,
    hasConflict,
  };
}

export const EMPTY_BOARD: BoardPageData = createBoardWithTickets([]);

export const SEEDED_BOARD: BoardPageData = createBoardWithTickets(DEFAULT_TICKETS);
