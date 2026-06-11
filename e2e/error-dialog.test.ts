import { describe, it } from "vitest";
import fs from "node:fs";
import {
  createProject, uniqueSlug, gotoProject, setupE2E,
} from "./fixtures.js";

describe("Error dialog (e2e, real server)", () => {
  const ctx = setupE2E();

  it("error-dialog-ok dismisses the dialog when sync fails", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("err-dialog"),
      withRemote: true,
    });
    ctx.projects.push(project);

    if (project.remoteUrl) {
      fs.rmSync(project.remoteUrl, { recursive: true, force: true });
    }

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    const syncButton = ctx.page.locator('[data-testid="sync-button-trigger"]');
    await syncButton.waitFor({ state: "visible", timeout: 10000 });
    await ctx.page.waitForTimeout(500);
    await syncButton.click();
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', { state: "visible", timeout: 20000 });
    await ctx.page.click('[data-testid="error-dialog-ok"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', { state: "detached", timeout: 15000 });
  }, 60000);
});
