import { describe, it, expect } from "vitest";
import {
  openProject, dragElement, sortableItem,
  setupE2E, THREE_COLUMN_BOARD,
} from "./fixtures.js";
import { aheadCount, porcelainStatus } from "./git-fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Sync button drag (e2e, real server)", () => {
  const ctx = setupE2E();

  it("pending badge appears after creating a ticket", async () => {
    await openProject(ctx, { slugBase: "sb-pending-appear", withRemote: true });
    await testId(ctx.page, "project-header-new-ticket-button").click();
    await waitVisible(ctx.page, "create-ticket-number-input");
    await testId(ctx.page, "create-ticket-number-input").fill("P-1");
    await testId(ctx.page, "create-ticket-title-input").fill("Pending test");
    await testId(ctx.page, "create-ticket-submit").click();
    await waitVisible(ctx.page, "sync-button-pending-badge");
  });

  it("pending badge disappears after sync", async () => {
    await openProject(ctx, { slugBase: "sb-pending-sync", withRemote: true });
    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");
  });

  it("pending badge clears after dragging a ticket there and back", async () => {
    const project = await openProject(ctx, {
      slugBase: "sb-pending-dragback",
      withRemote: true,
      seedRemoteBaseline: true,
      withBoards: THREE_COLUMN_BOARD,
      withTickets: [
        { number: "B-1", title: "Boomerang", status: "todo", folderName: "b-1-boomerang" },
      ],
      withTicketOrder: {
        todo: ["b-1-boomerang"],
        "in-progress": [],
        done: [],
      },
    });

    await dragElement(
      ctx.page,
      sortableItem(ctx.page, "todo:b-1-boomerang"),
      testId(ctx.page, "kanban-board-empty-dropzone", { "data-column-name": "in-progress" }),
    );
    await sortableItem(ctx.page, "in-progress:b-1-boomerang")
      .waitFor({ state: "visible", timeout: 15000 });
    await waitVisible(ctx.page, "sync-button-pending-badge");
    await dragElement(
      ctx.page,
      sortableItem(ctx.page, "in-progress:b-1-boomerang"),
      testId(ctx.page, "kanban-board-empty-dropzone", { "data-column-name": "todo" }),
    );

    await waitGone(ctx.page, "sync-button-pending-badge");

    expect(porcelainStatus(project.ticketsPath)).toBe("");
    expect(aheadCount(project.ticketsPath)).toBe(0);
  });
});
