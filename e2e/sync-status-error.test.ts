import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { openProject, setupE2E } from "./fixtures.js";
import { testId, waitVisible } from "./locators.js";

describe("Sync status failure (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("keeps the shell and surfaces the error on the sync button when git state cannot be derived", async () => {
    const project = await openProject(ctx, {
      slugBase: "sync-status-error",
      withRemote: true,
      withTickets: [{ number: "E-1", title: "Initial", status: "todo", folderName: "e-1-initial" }],
    });

    fs.rmSync(path.join(project.ticketsPath, ".git"), { force: true });

    await ctx.page.reload();
    await waitVisible(ctx.page, "project-header-settings-button");
    await waitVisible(ctx.page, "project-load-error");
    await waitVisible(ctx.page, "sync-status-error-button");
    expect(await testId(ctx.page, "sync-button-trigger").count()).toBe(0);
  });
});
