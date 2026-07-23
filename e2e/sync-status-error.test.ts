import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createProject, uniqueSlug, gotoProject, setupE2E } from "./fixtures.js";

describe("Sync status failure (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("keeps the shell and surfaces the error on the sync button when git state cannot be derived", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sync-status-error"),
      withRemote: true,
      withTickets: [{ number: "E-1", title: "Initial", status: "todo", folderName: "e-1-initial" }],
    });
    ctx.projects.push(project);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    fs.rmSync(path.join(project.ticketsPath, ".git"), { force: true });

    await ctx.page.reload();
    await ctx.page.waitForSelector('[data-testid="project-header-settings-button"]', {
      state: "visible",
      timeout: 15000,
    });
    await ctx.page.waitForSelector('[data-testid="project-load-error"]', {
      state: "visible",
      timeout: 15000,
    });
    await ctx.page.waitForSelector('[data-testid="sync-status-error-button"]', {
      state: "visible",
      timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="sync-button-trigger"]').count()).toBe(0);
  }, 60000);
});
