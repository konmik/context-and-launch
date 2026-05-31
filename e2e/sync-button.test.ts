import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  createProject, uniqueSlug, gotoProject,
  setupE2E,
} from "./fixtures.js";

describe("Sync button (e2e, real server)", () => {
  const ctx = setupE2E();

  it("sync-button-trigger renders on the page", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("sb-render") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-trigger"]', { state: "visible", timeout: 10000 });
  }, 60000);

  it("sync-button-trigger push to remote, then sync-button-check-icon appears", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-push"),
      withRemote: true,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-check-icon"]', {
      state: "visible", timeout: 20000,
    });
    if (project.remoteUrl) {
      const log = execSync(`git log --all --format=%s`, { cwd: project.remoteUrl, encoding: "utf-8" });
      expect(log.length).toBeGreaterThan(0);
    }
  }, 60000);

  it("sync-button-check-icon and sync-button-conflict-badge are absent on a fresh project", async () => {
    const project = await createProject(ctx.testServer, { projectSlug: uniqueSlug("sb-icons") });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    expect(await ctx.page.locator('[data-testid="sync-button-check-icon"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="sync-button-conflict-badge"]').count()).toBe(0);
  }, 60000);
});
