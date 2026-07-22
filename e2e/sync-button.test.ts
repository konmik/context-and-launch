import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  createProject, uniqueSlug, gotoProject, dragSortable,
  setupE2E,
} from "./fixtures.js";

describe("Sync button (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

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

  it("pending badge appears after dragging a ticket between columns", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-drag"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "D-1", title: "Drag me", status: "todo", folderName: "d-1-drag-me" },
        { number: "D-2", title: "Anchor", status: "in-progress", folderName: "d-2-anchor" },
      ],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });

    await dragSortable(
      ctx.page,
      '[data-sortable-id="todo:d-1-drag-me"]',
      '[data-sortable-id="in-progress:d-2-anchor"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);
});
