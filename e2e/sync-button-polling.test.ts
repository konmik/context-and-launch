import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createProject, uniqueSlug, gotoProject,
  setupE2E,
} from "./fixtures.js";

describe("Sync button polling and trigger state (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("untracked files make pending badge appear", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-untracked"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });

    await ctx.page.clock.install();
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    // The initial sync-pending fetch runs after requestIdleCallback (faked as a
    // 50ms timer), so advance past it instead of waiting on real time.
    await ctx.page.clock.fastForward(100);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 5000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 10000,
    });

    fs.writeFileSync(path.join(project.ticketsPath, "loose-file.txt"), "untracked");

    // The badge refresh is gated on the 10s sync-pending poll, and the server
    // only notices the new file once its watcher bumps the worktree revision
    // (a real chokidar event). Fire the poll repeatedly until the badge
    // appears: each fastForward re-fetches after the watcher has had time to
    // invalidate the server-side cache.
    await expect.poll(
      async () => {
        await ctx.page.clock.fastForward(11_000);
        return ctx.page.locator('[data-testid="sync-button-pending-badge"]').isVisible();
      },
      { timeout: 5000 },
    ).toBe(true);
  }, 60000);

  it("double-click sync: second click is ignored while first is in progress", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-doubleclick"),
      withRemote: true,
      withTickets: [{ number: "DC-1", title: "Double", status: "todo", folderName: "dc-1-double" }],
    });
    ctx.projects.push(project);

    await ctx.page.clock.install();
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.clock.fastForward(100);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 5000 });

    await ctx.page.click('[data-testid="sync-button-trigger"]');

    const isDisabled = await ctx.page.locator('[data-testid="sync-button-trigger"]').isDisabled();
    expect(isDisabled).toBe(true);

    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 10000,
    });
  }, 60000);

  it("switch project resets pending badge and polls new project", async () => {
    const project1 = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-switch-a"),
      withRemote: true,
      withTickets: [{ number: "SW-1", title: "Has changes", status: "todo", folderName: "sw-1-has-changes" }],
    });
    ctx.projects.push(project1);

    const project2 = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-switch-b"),
      withRemote: true,
    });
    ctx.projects.push(project2);
    execSync("git push -u origin tickets", { cwd: project2.ticketsPath });

    await ctx.page.clock.install();
    await gotoProject(ctx.page, ctx.testServer, project1.projectSlug);
    await ctx.page.clock.fastForward(100);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 5000,
    });

    await gotoProject(ctx.page, ctx.testServer, project2.projectSlug);
    await ctx.page.clock.fastForward(100);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 5000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 10000,
    });
  }, 60000);
});
