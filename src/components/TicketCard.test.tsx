import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import TicketCard from "./TicketCard";
import type { TicketInfo } from "~/types.js";

function makeTicket(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test ticket",
    status: "todo",
    folderName: "t-1-test-ticket",
    stageNames: [],
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

    const buttons = [...document.querySelectorAll("button")].map(b => b.textContent?.trim());
    expect(buttons).toContain("Archive");
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

    const archiveBtn = [...document.querySelectorAll("button")].find(
      b => b.textContent?.trim() === "Archive"
    ) as HTMLElement;
    await fireEvent.click(archiveBtn);

    expect(onArchive).toHaveBeenCalledWith(ticket);
  });

  it("menu closes on outside mousedown", async () => {
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

    const menuVisible = () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim() === "Archive"
      );
    expect(menuVisible()).toBe(true);

    await fireEvent.mouseDown(document.body);

    expect(menuVisible()).toBe(false);
  });
});
