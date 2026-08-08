import { describe, it, expect } from "vitest";
import {
  openProject, dragElement, sortableItem,
  setupE2E, THREE_COLUMN_BOARD,
} from "./fixtures.js";
import { remoteLog } from "./git-fixtures.js";
import { countOf, testId, waitVisible, waitGone } from "./locators.js";

describe("Sync button (e2e, real server)", () => {
  const ctx = setupE2E();

  it("sync-button-trigger renders on the page", async () => {
    await openProject(ctx, { slugBase: "sb-render" });
    await waitVisible(ctx.page, "sync-button-trigger");
  });

  it("sync-button-trigger push to remote, then sync-button-check-icon appears", async () => {
    const project = await openProject(ctx, {
      slugBase: "sb-push",
      withRemote: true,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    await testId(ctx.page, "sync-button-trigger").click();
    await waitVisible(ctx.page, "sync-button-check-icon");
    expect(remoteLog(project, "--all --format=%s").length).toBeGreaterThan(0);
  });

  it("sync-button-check-icon and sync-button-conflict-badge are absent on a fresh project", async () => {
    await openProject(ctx, { slugBase: "sb-icons" });
    expect(await countOf(ctx.page, "sync-button-check-icon")).toBe(0);
    expect(await countOf(ctx.page, "sync-button-conflict-badge")).toBe(0);
  });

  it("pending badge appears after dragging a ticket between columns", async () => {
    await openProject(ctx, {
      slugBase: "sb-pending-drag",
      withRemote: true,
      withBoards: THREE_COLUMN_BOARD,
      withTickets: [
        { number: "D-1", title: "Drag me", status: "todo", folderName: "d-1-drag-me" },
        { number: "D-2", title: "Anchor", status: "in-progress", folderName: "d-2-anchor" },
      ],
    });

    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");

    await dragElement(
      ctx.page,
      sortableItem(ctx.page, "todo:d-1-drag-me"),
      sortableItem(ctx.page, "in-progress:d-2-anchor"),
      { releaseAt: "top" },
    );

    await waitVisible(ctx.page, "sync-button-pending-badge");
  });
});
