import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gotoProjectOnFakeClock, fastForwardPastSyncPoll, dragElement, sortableItem,
  openProject, seedProject, setupE2E, poll,
} from "./fixtures.js";
import {
  aheadCount, diffAgainstUpstream, fetchTickets, mutateRemote, pushTickets,
} from "./git-fixtures.js";
import { countOf, testId, waitVisible, waitGone } from "./locators.js";

describe("Sync button pending badge (e2e, real server)", () => {
  const ctx = setupE2E({
    // These tests wait on the server's auto-commit; shorten its debounce.
    serverOpts: { env: { CONTEXT_LAUNCH_WATCH_DEBOUNCE_MS: "200" } },
  });

  it("pending badge clears after drag there and back when auto-commit runs in between", async () => {
    const project = await openProject(ctx, {
      slugBase: "sb-pending-dragback-committed",
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "C-1", title: "Boomerang", status: "todo", folderName: "c-1-boomerang" },
        { number: "C-2", title: "Stay todo", status: "todo", folderName: "c-2-stay-todo" },
        { number: "C-3", title: "Stay progress", status: "in-progress", folderName: "c-3-stay-progress" },
      ],
      fakeClock: true,
    });

    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");

    const ahead = () => aheadCount(project.ticketsPath);

    await dragElement(
      ctx.page,
      sortableItem(ctx.page, "todo:c-1-boomerang"),
      sortableItem(ctx.page, "in-progress:c-3-stay-progress"),
      { releaseAt: "top" },
    );
    expect(
      await poll(ahead, (c) => c > 0, 10000, 250),
      "auto-commit did not run within 10s",
    ).toBeGreaterThan(0);

    await dragElement(
      ctx.page,
      sortableItem(ctx.page, "in-progress:c-1-boomerang"),
      sortableItem(ctx.page, "todo:c-2-stay-todo"),
      { releaseAt: "top" },
    );

    // The badge refresh after the auto-commit waits for the next poll.
    await fastForwardPastSyncPoll(ctx.page);
    await waitGone(ctx.page, "sync-button-pending-badge");

    expect(ahead()).toBeGreaterThan(0);
    expect(diffAgainstUpstream(project.ticketsPath)).toBe("");
  });

  it("unknown project: not-found page shows no pending badge", async () => {
    const unknownSlug = "nonexistent-project-xyz";

    await ctx.page.clock.install();
    await ctx.page.goto(`${ctx.testServer.baseUrl}/project/${unknownSlug}`);
    await ctx.page.getByText("Project not found").first().waitFor({ state: "visible", timeout: 10000 });
    // Let the poll run; the not-found page must never show a badge.
    await fastForwardPastSyncPoll(ctx.page);
    expect(await countOf(ctx.page, "sync-button-pending-badge")).toBe(0);
  });

  it("pending badge disappears after sync when local is behind remote", async () => {
    const project = await seedProject(ctx, {
      slugBase: "sb-behind-remote",
      withRemote: true,
      withTickets: [{ number: "R-1", title: "Initial", status: "todo", folderName: "r-1-initial" }],
    });

    pushTickets(project);
    mutateRemote(project, {
      message: "remote edit",
      edit: (clone) => fs.writeFileSync(
        path.join(clone, "r-1-initial", "to-do.md"), "updated remotely",
      ),
    });
    fetchTickets(project);

    await ctx.page.clock.install();
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project.projectSlug);
    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");
  });

  it("pending badge appears on fresh project due to order reconciliation", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-pending-absent", withRemote: true });
    pushTickets(project);
    await ctx.page.clock.install();
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project.projectSlug);
    await waitVisible(ctx.page, "sync-button-pending-badge");
  });
});
