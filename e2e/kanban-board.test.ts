import { describe, it, expect } from "vitest";
import {
  openProject, clickTicketMenuItem, setupE2E,
} from "./fixtures.js";
import { testId, waitVisible } from "./locators.js";

describe("Kanban board (e2e, real server)", () => {
  const ctx = setupE2E();

  it("renders kanban-board-column-header and kanban-board-column-description", async () => {
    await openProject(ctx, {
      slugBase: "kb-cols",
      withBoards: [{
        id: "kanban", name: "Kanban",
        columns: [
          { name: "todo", description: "Things to do" },
          { name: "done" },
        ],
      }],
    });
    const headers = await testId(ctx.page, "kanban-board-column-header").allTextContents();
    expect(headers.map(h => h.trim().toLowerCase())).toContain("todo");
    const desc = testId(ctx.page, "kanban-board-column-description").first();
    expect(await desc.textContent()).toBe("Things to do");
  });

  it("kanban-board-empty-dropzone renders for empty columns", async () => {
    await openProject(ctx, { slugBase: "kb-empty" });
    expect(await testId(ctx.page, "kanban-board-empty-dropzone").count()).toBeGreaterThan(0);
  });

  it("kanban-board-ticket-card click opens ticket detail dialog within 500ms", async () => {
    await openProject(ctx, {
      slugBase: "kb-click",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    const startedAt = performance.now();
    await testId(ctx.page, "kanban-board-ticket-card").first().click();
    await waitVisible(ctx.page, "ticket-detail-number-input");
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("kanban-board-ticket-menu-trigger opens menu with archive/delete items", async () => {
    await openProject(ctx, {
      slugBase: "kb-menu",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    const trigger = testId(ctx.page, "kanban-board-ticket-menu-trigger").first();
    await trigger.click();
    await testId(ctx.page, "kanban-board-ticket-menu-archive").waitFor({
      state: "visible", timeout: 10000,
    });
    expect(await testId(ctx.page, "kanban-board-ticket-menu-edit").count()).toBe(0);
    expect(await testId(ctx.page, "kanban-board-ticket-menu-archive").count()).toBe(1);
    expect(await testId(ctx.page, "kanban-board-ticket-menu-delete").count()).toBe(1);
  });

  it("kanban-board-ticket-menu-archive opens Archive Ticket dialog", async () => {
    await openProject(ctx, {
      slugBase: "kb-arch-menu",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    await clickTicketMenuItem(ctx.page, "archive");
    await waitVisible(ctx.page, "ticket-cleanup-submit");
  });

  it("kanban-board-ticket-menu-delete opens Delete Ticket dialog", async () => {
    await openProject(ctx, {
      slugBase: "kb-del-menu",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    await clickTicketMenuItem(ctx.page, "delete");
    await waitVisible(ctx.page, "ticket-cleanup-submit");
  });

  it("kanban-board-undefined-column and related testids render for orphan-status tickets", async () => {
    await openProject(ctx, {
      slugBase: "kb-orphan",
      withBoards: [{
        id: "kanban", name: "Kanban",
        columns: [{ name: "todo" }, { name: "done" }],
      }],
      withTickets: [{
        number: "T-9", title: "Orphan", status: "missing-col", folderName: "t-9-orphan",
      }],
    });
    await waitVisible(ctx.page, "kanban-board-undefined-column");
    expect(
      await testId(ctx.page, "kanban-board-undefined-column-description").textContent(),
    ).toBe("Update manually");
    expect(
      await testId(ctx.page, "kanban-board-ticket-orphaned-status").textContent(),
    ).toBe("missing-col");
  });
});
