import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import KanbanBoard from "./KanbanBoard";
import type { BoardState, TicketInfo, ColumnDefinition } from "~/types.js";

afterEach(() => cleanup());

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
  return {
    number: overrides.number ?? "T-1",
    title: overrides.title ?? "Test ticket",
    status: overrides.status ?? "todo",
    stageNames: [],
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

describe("KanbanBoard reactivity after reorder", () => {
  it("shows newly added ticket after a reorder has set orderOverride", () => {
    const ticketA = makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" });
    const [board, setBoard] = createSignal(makeBoard([ticketA]));

    render(() => (
      <KanbanBoard
        board={board()}
        slug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={noop}
      />
    ));

    expect(screen.getByText("Alpha")).toBeTruthy();

    const { setOrderOverride } = (window as any).__kanbanTestHooks ?? {};
    if (!setOrderOverride) {
      expect.fail("KanbanBoard must expose __kanbanTestHooks.setOrderOverride");
    }

    setOrderOverride({ todo: ["t-1-alpha"], done: [] });

    const ticketB = makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "todo" });
    setBoard(makeBoard([ticketA, ticketB]));

    expect(screen.getByText("Bravo")).toBeTruthy();
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

describe("KanbanBoard drag-end resolves to hoverTarget", () => {
  it("calls onReorder with hoverTarget column and index for cross-column drag", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "done" }),
      makeTicket({ folderName: "t-3-charlie", number: "T-3", title: "Charlie", status: "done" }),
    ];
    const board = makeBoard(tickets);

    let reorderCall: { folderName: string; fromColumn: string; toColumn: string; newIndex: number } | null = null;
    const onReorder = vi.fn((folderName: string, fromColumn: string, toColumn: string, newIndex: number) => {
      reorderCall = { folderName, fromColumn, toColumn, newIndex };
    });

    render(() => (
      <KanbanBoard
        board={board}
        slug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={onReorder}
      />
    ));

    const hooks = (window as any).__kanbanTestHooks;
    if (!hooks?.setHoverTarget || !hooks?.setActiveId || !hooks?.commitDrop) {
      expect.fail("KanbanBoard must expose __kanbanTestHooks.{setHoverTarget, setActiveId, commitDrop}");
    }

    // Simulate: dragging t-1-alpha from todo, hovering over done at index 1 (between Bravo and Charlie)
    hooks.setActiveId("todo:t-1-alpha");
    hooks.setHoverTarget({ column: "done", index: 1 });

    hooks.commitDrop("todo", "t-1-alpha", "done", 1);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(reorderCall).toEqual({
      folderName: "t-1-alpha",
      fromColumn: "todo",
      toColumn: "done",
      newIndex: 1,
    });
  });

  it("resolves same-column drag to hoverTarget index", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "todo" }),
      makeTicket({ folderName: "t-3-charlie", number: "T-3", title: "Charlie", status: "todo" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);

    let reorderCall: { folderName: string; fromColumn: string; toColumn: string; newIndex: number } | null = null;
    const onReorder = vi.fn((folderName: string, fromColumn: string, toColumn: string, newIndex: number) => {
      reorderCall = { folderName, fromColumn, toColumn, newIndex };
    });

    render(() => (
      <KanbanBoard
        board={board}
        slug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={onReorder}
      />
    ));

    const hooks = (window as any).__kanbanTestHooks;
    if (!hooks?.setHoverTarget || !hooks?.setActiveId || !hooks?.commitDrop) {
      expect.fail("KanbanBoard must expose __kanbanTestHooks.{setHoverTarget, setActiveId, commitDrop}");
    }

    // Simulate: dragging t-1-alpha from position 0 to position 2 (between Bravo and Charlie)
    hooks.setActiveId("todo:t-1-alpha");
    hooks.setHoverTarget({ column: "todo", index: 2 });

    hooks.commitDrop("todo", "t-1-alpha", "todo", 2);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(reorderCall).toEqual({
      folderName: "t-1-alpha",
      fromColumn: "todo",
      toColumn: "todo",
      newIndex: 2,
    });
  });
});

describe("KanbanBoard column descriptions", () => {
  it("renders description when present", () => {
    const board = makeBoard([], [{ name: "todo", description: "Work items" }, { name: "done" }]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    const desc = container.querySelector('[data-testid="column-description"]');
    expect(desc).toBeTruthy();
    expect(desc!.textContent).toBe("Work items");
  });

  it("does not render description when absent", () => {
    const board = makeBoard([], ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    expect(container.querySelectorAll('[data-testid="column-description"]').length).toBe(0);
  });
});

describe("KanbanBoard undefined column", () => {
  it("renders undefined column for orphaned tickets", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "deleted-col" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    const undefinedCol = container.querySelector('[data-testid="undefined-column"]');
    expect(undefinedCol).toBeTruthy();
    expect(undefinedCol!.textContent).toContain("undefined");
  });

  it("undefined column has red styling", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "gone" }),
    ];
    const board = makeBoard(tickets, ["todo"]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    const undefinedCol = container.querySelector('[data-testid="undefined-column"]');
    expect(undefinedCol!.className).toContain("border-destructive");
  });

  it("shows orphaned status text in red", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "vanished" }),
    ];
    const board = makeBoard(tickets, ["todo"]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    const orphanedStatus = container.querySelector('[data-testid="orphaned-status"]');
    expect(orphanedStatus).toBeTruthy();
    expect(orphanedStatus!.textContent).toBe("vanished");
  });

  it("does not render undefined column when no orphaned tickets", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);
    const { container } = render(() => (
      <KanbanBoard board={board} slug="test" onEdit={noop} onDelete={noop} onViewDetail={noop} onArchive={noop} onReorder={noop} />
    ));
    expect(container.querySelector('[data-testid="undefined-column"]')).toBeNull();
  });

  it("rejects drop into the undefined column", () => {
    const tickets = [
      makeTicket({ folderName: "t-1-alpha", number: "T-1", title: "Alpha", status: "todo" }),
      makeTicket({ folderName: "t-2-bravo", number: "T-2", title: "Bravo", status: "gone" }),
    ];
    const board = makeBoard(tickets, ["todo", "done"]);

    const onReorder = vi.fn();

    render(() => (
      <KanbanBoard
        board={board}
        slug="test"
        onEdit={noop}
        onDelete={noop}
        onViewDetail={noop}
        onArchive={noop}
        onReorder={onReorder}
      />
    ));

    const hooks = (window as any).__kanbanTestHooks;
    if (!hooks?.commitDrop) {
      expect.fail("KanbanBoard must expose __kanbanTestHooks.commitDrop");
    }

    // Attempt to drop a ticket into the undefined column
    hooks.commitDrop("todo", "t-1-alpha", "undefined", 0);

    // Should NOT have called onReorder with "undefined" as toColumn
    expect(onReorder).not.toHaveBeenCalled();
  });
});
