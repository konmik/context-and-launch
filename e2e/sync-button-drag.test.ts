import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  createProject, uniqueSlug, gotoProject, dragSortable,
  setupE2E,
} from "./fixtures.js";

describe("Sync button drag (e2e, real server)", () => {
  const ctx = setupE2E({ serverOpts: { dataDirPrefix: ".cl-e2e-data-" } });

  it("pending badge appears after creating a ticket", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-appear"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForTimeout(1000);
    await ctx.page.click('[data-testid="project-header-new-ticket-button"]');
    await ctx.page.waitForSelector('[data-testid="create-ticket-number-input"]', {
      state: "visible", timeout: 10000,
    });
    await ctx.page.fill('[data-testid="create-ticket-number-input"]', "P-1");
    await ctx.page.fill('[data-testid="create-ticket-title-input"]', "Pending test");
    await ctx.page.click('[data-testid="create-ticket-submit"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);

  it("pending badge disappears after sync", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-sync"),
      withRemote: true,
      withTickets: [{ number: "S-1", title: "Sync me", status: "todo", folderName: "s-1-sync-me" }],
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
  }, 60000);

  it("pending badge clears after dragging a ticket there and back", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-dragback"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "B-1", title: "Boomerang", status: "todo", folderName: "b-1-boomerang" },
        { number: "B-2", title: "Stay todo", status: "todo", folderName: "b-2-stay-todo" },
        { number: "B-3", title: "Stay progress", status: "in-progress", folderName: "b-3-stay-progress" },
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
      '[data-sortable-id="todo:b-1-boomerang"]',
      '[data-sortable-id="in-progress:b-3-stay-progress"]',
      { releaseAt: "top" },
    );
    await dragSortable(
      ctx.page,
      '[data-sortable-id="in-progress:b-1-boomerang"]',
      '[data-sortable-id="todo:b-2-stay-todo"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 15000,
    });

    const porcelain = execSync("git status --porcelain", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(porcelain.trim()).toBe("");
    const aheadCount = execSync("git rev-list @{u}..HEAD --count", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(aheadCount.trim()).toBe("0");
  }, 60000);
});
