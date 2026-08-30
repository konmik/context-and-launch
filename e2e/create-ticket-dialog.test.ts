import { describe, it, expect } from "vitest";
import {
  openProject, setupE2E,
  listTicketFolders, readTicketStatus,
} from "./fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("CreateTicketDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openCreate() {
    await testId(ctx.page, "project-header-new-ticket-button").click();
    await waitVisible(ctx.page, "create-ticket-number-input");
  }

  it("create-ticket-number-input and title-input accept values", async () => {
    await openProject(ctx, { slugBase: "ct-vals" });
    await openCreate();
    await testId(ctx.page, "create-ticket-number-input").fill("ABC-1");
    await testId(ctx.page, "create-ticket-title-input").fill("First Ticket");
    expect(await ctx.page.inputValue('[data-testid="create-ticket-number-input"]')).toBe("ABC-1");
    expect(await ctx.page.inputValue('[data-testid="create-ticket-title-input"]')).toBe("First Ticket");
  });

  it("create-ticket-cancel closes the dialog without creating", async () => {
    const project = await openProject(ctx, { slugBase: "ct-cancel" });
    await openCreate();
    await testId(ctx.page, "create-ticket-cancel").click();
    await waitGone(ctx.page, "create-ticket-number-input");
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toEqual([]);
  });

  it("stays open when a pointer press starts inside and ends outside", async () => {
    await openProject(ctx, { slugBase: "ct-drag-out" });
    await openCreate();
    const input = testId(ctx.page, "create-ticket-number-input");
    const box = await input.boundingBox();
    expect(box).not.toBeNull();

    await ctx.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await ctx.page.mouse.down();
    await ctx.page.mouse.move(5, 5);
    await ctx.page.mouse.up();

    expect(await input.count()).toBe(1);
  });

  it("create-ticket-submit creates a ticket on disk", async () => {
    const project = await openProject(ctx, { slugBase: "ct-submit" });
    await openCreate();
    await testId(ctx.page, "create-ticket-number-input").fill("ABC-1");
    await testId(ctx.page, "create-ticket-title-input").fill("First Ticket");
    await testId(ctx.page, "create-ticket-submit").click();
    await waitVisible(ctx.page, "kanban-board-ticket-card");
    const folders = listTicketFolders(ctx.testServer, project.projectSlug);
    expect(folders.length).toBe(1);
    const status = readTicketStatus(ctx.testServer, project.projectSlug, folders[0]);
    expect(status?.number).toBe("ABC-1");
    expect(status?.title).toBe("First Ticket");
  });

  it("regenerate button suggests number for typed prefix", async () => {
    await openProject(ctx, {
      slugBase: "ct-regen",
      withTickets: [
        { number: "ST-0001", title: "First", status: "todo" },
        { number: "ST-0002", title: "Second", status: "todo" },
        { number: "BUG-0001", title: "Bug One", status: "todo" },
      ],
    });
    await openCreate();
    await testId(ctx.page, "create-ticket-number-input").fill("BUG");
    await testId(ctx.page, "create-ticket-regenerate-button").click();
    const sel = '[data-testid="create-ticket-number-input"]';
    await ctx.page.waitForFunction(
      (s) => document.querySelector<HTMLInputElement>(s)?.value.startsWith("BUG-"),
      sel,
      { timeout: 10000 },
    );
    const value = await ctx.page.inputValue('[data-testid="create-ticket-number-input"]');
    expect(value).toBe("BUG-0002");
  });
});
