import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gotoProjectOnFakeClock, fastForwardUntilVisible, openProject, seedProject,
  setupE2E,
} from "./fixtures.js";
import { pushTickets } from "./git-fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Sync button polling and trigger state (e2e, real server)", () => {
  const ctx = setupE2E();

  it("untracked files make pending badge appear", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-untracked", withRemote: true });
    pushTickets(project);

    await ctx.page.clock.install();
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project.projectSlug);
    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");

    fs.writeFileSync(path.join(project.ticketsPath, "loose-file.txt"), "untracked");

    // The server only sees the new file once its watcher bumps the worktree
    // revision, which is a real chokidar event on real time.
    await fastForwardUntilVisible(ctx.page, "sync-button-pending-badge");
  });

  it("double-click sync: second click is ignored while first is in progress", async () => {
    await openProject(ctx, {
      slugBase: "sb-doubleclick",
      withRemote: true,
      withTickets: [{ number: "DC-1", title: "Double", status: "todo", folderName: "dc-1-double" }],
      fakeClock: true,
    });
    await waitVisible(ctx.page, "sync-button-trigger");

    await testId(ctx.page, "sync-button-trigger").click();

    const isDisabled = await testId(ctx.page, "sync-button-trigger").isDisabled();
    expect(isDisabled).toBe(true);

    await waitVisible(ctx.page, "sync-button-check-icon");
  });

  it("switch project resets pending badge and polls new project", async () => {
    const project1 = await seedProject(ctx, {
      slugBase: "sb-switch-a",
      withRemote: true,
      withTickets: [{ number: "SW-1", title: "Has changes", status: "todo", folderName: "sw-1-has-changes" }],
    });

    const project2 = await seedProject(ctx, { slugBase: "sb-switch-b", withRemote: true });
    pushTickets(project2);

    await ctx.page.clock.install();
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project1.projectSlug);
    await waitVisible(ctx.page, "sync-button-pending-badge");

    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project2.projectSlug);
    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitGone(ctx.page, "sync-button-pending-badge");
  });
});
