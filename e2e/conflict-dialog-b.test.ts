import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, setupE2E, expectOpenConfigDirRequest,
  openConflictDialog, readProjectRegistry,
} from "./fixtures.js";
import { createActiveRebaseConflict } from "./conflict-dialog-shared.js";

describe("Conflict dialog II (e2e, real server)", () => {
  const ctx = setupE2E();
  it("sync during active rebase conflict shows conflict dialog (regression: HEAD-detached error)", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-active-rebase"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
  }, 60000);

  it("selecting a profile persists the global pref and pre-selects it on reopen", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-global-pref"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [
          { name: "Claude", command: "echo claude" },
          { name: "Codex", command: "echo codex" },
        ],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);

    const select = ctx.page.locator('[data-testid="conflict-dialog-profile-select"]');
    await select.selectOption("Codex");

    // Wait for the PUT to land in config.json.
    await expect.poll(
      () => readProjectRegistry(ctx.testServer).lastUsedProfileName,
      { timeout: 15000 },
    ).toBe("Codex");

    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });

    // Reload the page and reopen the dialog: the previously selected profile is pre-selected.
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await expect.poll(async () =>
      ctx.page.locator('[data-testid="conflict-dialog-profile-select"]').inputValue(),
    ).toBe("Codex");
  }, 60000);

  it("open-tickets-repo fires open-config-dir", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-open"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="conflict-dialog-open-tickets-repo"]'));
  }, 60000);
});
