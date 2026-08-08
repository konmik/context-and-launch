import { describe, it } from "vitest";
import fs from "node:fs";
import { gotoProject, seedProject, setupE2E } from "./fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

describe("Error dialog (e2e, real server)", () => {
  const ctx = setupE2E();

  it("error-dialog-ok dismisses the dialog when sync fails", async () => {
    const project = await seedProject(ctx, {
      slugBase: "err-dialog",
      withRemote: true,
    });

    if (project.remoteUrl) {
      fs.rmSync(project.remoteUrl, { recursive: true, force: true });
    }

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    const syncButton = testId(ctx.page, "sync-button-trigger");
    await syncButton.waitFor({ state: "visible", timeout: 10000 });
    await syncButton.click();
    await waitVisible(ctx.page, "error-dialog-ok");
    await testId(ctx.page, "error-dialog-ok").click();
    await waitGone(ctx.page, "error-dialog-ok");
  });
});
