import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import KanbanBoard from "./KanbanBoard";
import type { BoardState, TicketInfo } from "~/types.js";

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
  return {
    number: overrides.number ?? "T-1",
    title: overrides.title ?? "Test ticket",
    status: overrides.status ?? "todo",
    stageNames: [],
    useWorktree: false,
    ...overrides,
  };
}

function makeBoard(tickets: TicketInfo[], columns = ["todo", "done"]): BoardState {
  const ticketOrder: Record<string, string[]> = {};
  for (const col of columns) {
    ticketOrder[col] = tickets
      .filter((t) => t.status === col)
      .map((t) => t.folderName);
  }
  return { columns, tickets, ticketOrder };
}

const noop = () => {};

describe("KanbanBoard rendering", () => {
  it("renders column headers", () => {
    const board = makeBoard([], ["todo", "in-progress", "done"]);
    render(() => (
      <KanbanBoard
        board={board}
        slug="test"
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
        slug="test"
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
        slug="test"
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
        slug="test"
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

describe("KanbanBoard drop indicator", () => {
  it("shows indicator in destination column during cross-column drag", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "done" }),
    ];
    const board = makeBoard(tickets);
    const { container } = render(() => (
      <KanbanBoard
        board={board}
        slug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));

    // No indicator when not dragging
    expect(container.querySelectorAll("[data-drop-indicator]").length).toBe(0);

    // Simulate: user is dragging t-1-alpha from todo, hovering over done column at index 0.
    // The board should expose a way to set the hover target for testing.
    // We use the data-testid="hover-target-input" hidden input that the component
    // exposes in dev mode... no. We need a real mechanism.
    //
    // Since jsdom can't simulate real pointer DnD, we test this through
    // the component's exported setHoverTargetForTest function.
    const { setHoverTarget, setActiveId } = (window as any).__kanbanTestHooks ?? {};
    if (!setHoverTarget || !setActiveId) {
      expect.fail("KanbanBoard must expose __kanbanTestHooks.{setHoverTarget, setActiveId}");
    }

    setActiveId("todo:t-1-alpha");
    setHoverTarget({ column: "done", index: 0 });

    const indicators = container.querySelectorAll("[data-drop-indicator]");
    expect(indicators.length).toBe(1);
  });
});
