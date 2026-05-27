import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import TicketCard from "./TicketCard";
import type { TicketInfo } from "~/server/ticket-store.js";

function makeTicket(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test ticket",
    status: "todo",
    folderName: "t-1-test-ticket",
    contextNames: [],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

describe("TicketCard overflow menu", () => {
  afterEach(() => cleanup());

  it("shows Archive option in the overflow menu", async () => {
    const onArchive = vi.fn();
    const { container } = render(() => (
      <TicketCard
        ticket={makeTicket()}
        onEdit={() => {}}
        onDelete={() => {}}
        onArchive={onArchive}
        onViewDetail={() => {}}
      />
    ));

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const items = [...document.querySelectorAll("[role='menuitem']")].map(el => el.textContent?.trim());
    expect(items).toContain("Archive");
  });

  it("calls onArchive when Archive is clicked", async () => {
    const ticket = makeTicket();
    const onArchive = vi.fn();
    const { container } = render(() => (
      <TicketCard
        ticket={ticket}
        onEdit={() => {}}
        onDelete={() => {}}
        onArchive={onArchive}
        onViewDetail={() => {}}
      />
    ));

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const archiveItem = [...document.querySelectorAll("[role='menuitem']")].find(
      el => el.textContent?.trim() === "Archive"
    ) as HTMLElement;
    await fireEvent.click(archiveItem);

    expect(onArchive).toHaveBeenCalledWith(ticket);
  });

  it("shows all three menu options", async () => {
    cleanup();
    const { container } = render(() => (
      <TicketCard
        ticket={makeTicket()}
        onEdit={() => {}}
        onDelete={() => {}}
        onArchive={() => {}}
        onViewDetail={() => {}}
      />
    ));

    const menuBtn = container.querySelector("[aria-label='Ticket actions']") as HTMLElement;
    await fireEvent.click(menuBtn);

    const items = [...document.querySelectorAll("[role='menuitem']")].map(el => el.textContent?.trim());
    expect(items).toContain("Edit");
    expect(items).toContain("Archive");
    expect(items).toContain("Delete");
  });
});
