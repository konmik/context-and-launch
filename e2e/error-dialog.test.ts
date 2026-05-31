import { describe, it } from "vitest";
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

    await ctx.page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 500, contentType: "application/json",
          body: JSON.stringify({ description: "Sync failed", command: "git push", output: "boom" }),
        });
      } else {
        route.continue();
      }
    });

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
