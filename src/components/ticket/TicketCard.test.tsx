import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import TicketCard from "./TicketCard";
import { HerdrStatusesContext } from "./herdr-statuses-context.js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

function makeTicket(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test ticket",
    status: "todo",
    folderName: "t-1-test-ticket",
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

function renderCard(props: {
  ticket?: Partial<TicketInfo>;
  columns?: { name: string; color?: string }[];
  herdrStatuses?: Record<string, HerdrAgentStatus>;
  onEdit?: (ticket: TicketInfo) => void;
  onDelete?: (ticket: TicketInfo) => void;
  onArchive?: (ticket: TicketInfo) => void;
}) {
  return render(() => (
    <HerdrStatusesContext.Provider value={(folderName) => props.herdrStatuses?.[folderName]}>
      <TicketCard
        ticket={makeTicket(props.ticket)}
        columns={props.columns ?? []}
        onEdit={props.onEdit ?? (() => {})}
        onDelete={props.onDelete ?? (() => {})}
        onArchive={props.onArchive ?? (() => {})}
        onViewDetail={() => {}}
      />
    </HerdrStatusesContext.Provider>
  ));
}

describe("TicketCard overflow menu", () => {
  afterEach(() => cleanup());

  it("shows Archive option in the overflow menu", async () => {
    const onArchive = vi.fn();
    const { container } = renderCard({ onArchive });

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const items = [...document.querySelectorAll("[role='menuitem']")].map(el => el.textContent?.trim());
    expect(items).toContain("Archive");
  });

  it("calls onArchive when Archive is clicked", async () => {
    const onArchive = vi.fn();
    const { container } = renderCard({ onArchive });

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const archiveItem = [...document.querySelectorAll("[role='menuitem']")].find(
      el => el.textContent?.trim() === "Archive"
    ) as HTMLElement;
    await fireEvent.click(archiveItem);

    expect(onArchive).toHaveBeenCalledWith(makeTicket());
  });

  it("shows all three menu options", async () => {
    cleanup();
    const { container } = renderCard({});

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const items = [...document.querySelectorAll("[role='menuitem']")].map(el => el.textContent?.trim());
    expect(items).toContain("Edit");
    expect(items).toContain("Archive");
    expect(items).toContain("Delete");
  });
});

describe("TicketCard status swatch and herdr icon", () => {
  afterEach(() => cleanup());

  it("renders the swatch with the column color", () => {
    const { container } = renderCard({
      ticket: { status: "todo" },
      columns: [{ name: "todo", color: "#1a7f37" }],
    });
    const swatch = container.querySelector('[data-testid="status-swatch"]') as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.getAttribute("title")).toBe("todo");
    expect(swatch.style.backgroundColor).toBe("rgb(26, 127, 55)");
  });

  it("renders no swatch when the matching column has no color", () => {
    const { container } = renderCard({
      ticket: { status: "todo" },
      columns: [{ name: "todo" }],
    });
    expect(container.querySelector('[data-testid="status-swatch"]')).toBeNull();
  });

  it("renders a destructive swatch when the status matches no column", () => {
    const { container } = renderCard({
      ticket: { status: "vanished" },
      columns: [{ name: "todo", color: "#1a7f37" }],
    });
    const swatch = container.querySelector('[data-testid="status-swatch"]') as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.classList).toContain("bg-destructive");
  });

  it("renders the herdr icon when the ticket has a status", () => {
    const { container } = renderCard({
      herdrStatuses: { "t-1-test-ticket": "working" },
    });
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("data-herdr-status")).toBe("working");
  });

  it("renders no herdr icon without a status", () => {
    const { container } = renderCard({});
    expect(container.querySelector('[data-testid="herdr-status-icon"]')).toBeNull();
  });
});
