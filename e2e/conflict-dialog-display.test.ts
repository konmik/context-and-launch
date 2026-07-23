import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject, setupE2E,
  openConflictDialog,
} from "./fixtures.js";
import { createActiveRebaseConflict } from "./conflict-dialog-shared.js";

describe("Conflict dialog display (e2e, real server)", () => {
  const ctx = setupE2E();
  it("conflict dialog elements render when sync returns conflict (intercepted)", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-rendering"),
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

    expect(await ctx.page.locator('[data-testid="conflict-dialog-open-tickets-repo"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-close"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-launch"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-abort"]').count()).toBeLessThanOrEqual(1);

    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

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

  it("abort dismisses the dialog during an active rebase", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-abort"),
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
    expect(await ctx.page.locator('[data-testid="conflict-dialog-abort"]').count()).toBe(1);
    await ctx.page.click('[data-testid="conflict-dialog-abort"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-abort"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("conflict badge appears after dismissing a mid-session sync conflict", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-badge-mid-session"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    expect(await ctx.page.locator('[data-testid="sync-button-conflict-badge"]').count()).toBe(0);

    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await openConflictDialog(ctx.page);
    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });

    await ctx.page.waitForSelector('[data-testid="sync-button-conflict-badge"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="sync-button-pending-badge"]').count()).toBe(0);
  }, 60000);
});
