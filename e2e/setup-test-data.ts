// All test data is defined as plain JavaScript objects.
// No fs, path, os, or memfs imports -- purely in-memory mock data.

const SLUG = "e2e-test";

export interface TicketInfo {
  number: string;
  title: string;
  status: string;
  folderName: string;
  stageNames: string[];
  useWorktree: boolean;
  fileNames: string[];
  references: { path: string; exists: boolean }[];
}

export interface BoardState {
  columns: string[];
  tickets: TicketInfo[];
  ticketOrder: Record<string, string[]>;
}

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

const DEFAULT_COLUMNS = ["todo", "in-progress", "done"];

const DEFAULT_TICKETS: TicketInfo[] = [
  { number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha", stageNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-2", title: "Bravo", status: "todo", folderName: "t-2-bravo", stageNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-3", title: "Charlie", status: "in-progress", folderName: "t-3-charlie", stageNames: [], useWorktree: false, fileNames: [], references: [] },
  { number: "T-4", title: "Delta", status: "in-progress", folderName: "t-4-delta", stageNames: [], useWorktree: false, fileNames: [], references: [] },
];

function buildTicketOrder(tickets: TicketInfo[], columns: string[]): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const col of columns) {
    order[col] = [];
  }
  for (const t of tickets) {
    if (!order[t.status]) order[t.status] = [];
    order[t.status].push(t.folderName);
  }
  return order;
}

export function createBoardWithTickets(tickets: TicketInfo[], columns = DEFAULT_COLUMNS, hasRemote = false, hasConflict = false): BoardPageData {
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
