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

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });

    fs.writeFileSync(path.join(project.ticketsPath, "loose-file.txt"), "untracked");

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("double-click sync: second click is ignored while first is in progress", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-doubleclick"),
      withRemote: true,
      withTickets: [{ number: "DC-1", title: "Double", status: "todo", folderName: "dc-1-double" }],
    });
    ctx.projects.push(project);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 10000 });

    await ctx.page.click('[data-testid="sync-button-trigger"]');

    const isDisabled = await ctx.page.locator('[data-testid="sync-button-trigger"]').isDisabled();
    expect(isDisabled).toBe(true);

    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
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

    await gotoProject(ctx.page, ctx.testServer, project1.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });

    await gotoProject(ctx.page, ctx.testServer, project2.projectSlug);

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });
  }, 60000);
});
