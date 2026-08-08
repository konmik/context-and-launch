import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  gotoProject, openProject, seedProject,
  setupE2E,
} from "./fixtures.js";
import { fetchTickets, mutateRemote, pushTickets } from "./git-fixtures.js";
import { countOf, testId, waitVisible } from "./locators.js";

describe("Sync button outcomes (e2e, real server)", () => {
  const ctx = setupE2E();

  it("no-remote: sync shows error dialog", async () => {
    await openProject(ctx, {
      slugBase: "sb-no-remote",
      withRemote: false,
      withTickets: [{ number: "NR-1", title: "Local only", status: "todo", folderName: "nr-1-local-only" }],
    });
    await waitVisible(ctx.page, "sync-button-trigger");
    await testId(ctx.page, "sync-button-trigger").click();
    await ctx.page.getByText("No remote").first().waitFor({ state: "visible", timeout: 10000 });
  });

  it("in-sync: sync succeeds with nothing to do", async () => {
    const project = await seedProject(ctx, { slugBase: "sb-in-sync", withRemote: true });
    pushTickets(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await waitVisible(ctx.page, "sync-button-pending-badge");
    await testId(ctx.page, "sync-button-trigger").click();
    await waitVisible(ctx.page, "sync-button-check-icon");

    await testId(ctx.page, "sync-button-trigger").click();
    await waitVisible(ctx.page, "sync-button-check-icon");
  });

  it("diverged with conflict: conflict badge remains after reloading", async () => {
    const project = await seedProject(ctx, {
      slugBase: "sb-conflict",
      withRemote: true,
      withTickets: [{ number: "CF-1", title: "Conflict", status: "todo", folderName: "cf-1-conflict" }],
    });

    pushTickets(project);
    mutateRemote(project, {
      message: "remote conflict",
      edit: (clone) => fs.writeFileSync(
        path.join(clone, "cf-1-conflict", "status.json"),
        JSON.stringify({ number: "CF-1", title: "Conflict", status: "done" }),
      ),
    });

    fs.writeFileSync(path.join(project.ticketsPath, "cf-1-conflict", "status.json"),
      JSON.stringify({ number: "CF-1", title: "Conflict", status: "in-progress" }));

    fetchTickets(project);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await testId(ctx.page, "sync-button-trigger").click();
    await waitVisible(ctx.page, "conflict-dialog-close");
    await testId(ctx.page, "conflict-dialog-close").click();
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await waitVisible(ctx.page, "sync-button-conflict-badge");
    expect(await countOf(ctx.page, "sync-button-pending-badge")).toBe(0);
  });
});
