import { describe, it, expect } from "vitest";
import {
  gotoProject, seedProject, setupE2E, expectOpenConfigDirRequest,
  openConflictDialog, readProjectRegistry,
  type SeedAppLauncherConfig,
} from "./fixtures.js";
import { createActiveRebaseConflict, CONFLICT_LAUNCHER } from "./conflict-dialog-shared.js";
import { testId, waitGone } from "./locators.js";

describe("Conflict dialog controls (e2e, real server)", () => {
  const ctx = setupE2E();

  /** Seeds a Project whose tickets worktree is already mid-rebase, then opens it. */
  async function openConflictedProject(
    slugBase: string,
    appLauncherConfig: SeedAppLauncherConfig = CONFLICT_LAUNCHER,
  ) {
    const project = await seedProject(ctx, { slugBase, withRemote: true, appLauncherConfig });
    createActiveRebaseConflict(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    return project;
  }

  it("launch button fires resolve-conflicts request", async () => {
    await openConflictedProject("conflict-launch");
    await openConflictDialog(ctx.page);
    const launchRequest = ctx.page.waitForRequest(
      (r) => r.url().includes("/_server"),
      { timeout: 5000 },
    );
    await testId(ctx.page, "conflict-dialog-launch").click();
    await launchRequest;
  });

  it("selecting a profile persists the global pref and pre-selects it on reopen", async () => {
    const project = await openConflictedProject("conflict-global-pref", {
      profiles: [
        { name: "Claude", command: "echo claude" },
        { name: "Codex", command: "echo codex" },
      ],
    });

    await openConflictDialog(ctx.page);

    const select = testId(ctx.page, "conflict-dialog-profile-select");
    await select.selectOption("Codex");

    // Wait for the PUT to land in config.json.
    await expect.poll(
      () => readProjectRegistry(ctx.testServer).lastUsedProfileName,
      { timeout: 15000 },
    ).toBe("Codex");

    await testId(ctx.page, "conflict-dialog-close").click();
    await waitGone(ctx.page, "conflict-dialog-profile-select");

    // Reload the page and reopen the dialog: the previously selected profile is pre-selected.
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await expect.poll(async () =>
      testId(ctx.page, "conflict-dialog-profile-select").inputValue(),
    ).toBe("Codex");
  });

  it("open-tickets-repo fires open-config-dir", async () => {
    await openConflictedProject("conflict-open");
    await openConflictDialog(ctx.page);
    await expectOpenConfigDirRequest(ctx.page, () =>
      testId(ctx.page, "conflict-dialog-open-tickets-repo").click());
  });
});
