import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import KanbanBoard from "./KanbanBoard";
import type { BoardState } from "~/components/project/project-api.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";

afterEach(() => cleanup());

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
  return {
    number: overrides.number ?? "T-1",
    title: overrides.title ?? "Test ticket",
    status: overrides.status ?? "todo",
    contextNames: [],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

function makeBoard(tickets: TicketInfo[], columns: string[] | ColumnDefinition[] = ["todo", "done"]): BoardState {
  const colDefs: ColumnDefinition[] = columns.map(c => typeof c === "string" ? { name: c } : c);
  const colNames = colDefs.map(c => c.name);
  const ticketOrder: Record<string, string[]> = {};
  for (const col of colNames) {
    ticketOrder[col] = tickets
      .filter((t) => t.status === col)
      .map((t) => t.folderName);
  }
  return { columns: colDefs, tickets, ticketOrder };
}

const noop = () => {};

describe("KanbanBoard rendering", () => {
  it("renders column headers", () => {
    const board = makeBoard([], ["todo", "in-progress", "done"]);
    render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    expect(screen.getByText("todo")).toBeTruthy();
    expect(screen.getByText("in-progress")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
  });

  it("renders ticket cards in correct columns", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "done" }),
    ];
    const board = makeBoard(tickets);
    render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    expect(screen.getByText("T-1")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("T-2")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("hides drop preview in empty columns when not dragging", () => {
    const board = makeBoard([], ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    expect(container.querySelectorAll("[data-drop-indicator]").length).toBe(0);
  });

  it("each ticket card wrapper has a data-sortable-id for hover target matching", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "todo" }),
    ];
    const board = makeBoard(tickets);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    const sortables = container.querySelectorAll("[data-sortable-id]");
    expect(sortables.length).toBe(2);
    expect(sortables[0].getAttribute("data-sortable-id")).toBe("todo:t-1-alpha");
    expect(sortables[1].getAttribute("data-sortable-id")).toBe("todo:t-2-bravo");
  });
});

describe("KanbanBoard column descriptions", () => {
  it("renders description when present", () => {
    const board = makeBoard([], [{ name: "todo", description: "Work items" }, { name: "done" }]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    const desc = container.querySelector('[data-testid="kanban-board-column-description"]');
    expect(desc).toBeTruthy();
    expect(desc!.textContent).toBe("Work items");
  });

  it("does not render description when absent", () => {
    const board = makeBoard([], ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    expect(container.querySelectorAll('[data-testid="kanban-board-column-description"]').length).toBe(0);
  });
});

describe("KanbanBoard undefined column", () => {
  it("renders undefined column for orphaned tickets", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "deleted-col" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    const undefinedCol = container.querySelector('[data-testid="kanban-board-undefined-column"]');
    expect(undefinedCol).toBeTruthy();
    expect(undefinedCol!.textContent).toContain("undefined");
  });

  it("undefined column has red styling", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "gone" }),
    ];
    const board = makeBoard(tickets, ["todo"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    const undefinedCol = container.querySelector('[data-testid="kanban-board-undefined-column"]');
    expect(undefinedCol!.className).toContain("border-destructive");
  });

  it("shows orphaned status text in red", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "vanished" }),
    ];
    const board = makeBoard(tickets, ["todo"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    const orphanedStatus = container.querySelector('[data-testid="kanban-board-ticket-orphaned-status"]');
    expect(orphanedStatus).toBeTruthy();
    expect(orphanedStatus!.textContent).toBe("vanished");
  });

  it("does not render undefined column when no orphaned tickets", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        projectSlug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));
    expect(container.querySelector('[data-testid="kanban-board-undefined-column"]')).toBeNull();
  });
});
