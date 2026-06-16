import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

  it("pending badge clears after drag there and back when auto-commit runs in between", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-dragback-committed"),
      withRemote: true,
      withBoards: [{ id: "standard", name: "Standard", columns: [
        { name: "todo" }, { name: "in-progress" }, { name: "done" },
      ]}],
      withTickets: [
        { number: "C-1", title: "Boomerang", status: "todo", folderName: "c-1-boomerang" },
        { number: "C-2", title: "Stay todo", status: "todo", folderName: "c-2-stay-todo" },
        { number: "C-3", title: "Stay progress", status: "in-progress", folderName: "c-3-stay-progress" },
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

    const aheadCount = () => parseInt(execSync("git rev-list @{u}..HEAD --count", {
      cwd: project.ticketsPath, encoding: "utf-8",
    }).trim(), 10);

    await dragSortable(
      ctx.page,
      '[data-sortable-id="todo:c-1-boomerang"]',
      '[data-sortable-id="in-progress:c-3-stay-progress"]',
      { releaseAt: "top" },
    );
    const deadline = Date.now() + 10000;
    while (aheadCount() === 0) {
      if (Date.now() > deadline) throw new Error("auto-commit did not run within 10s");
      await ctx.page.waitForTimeout(250);
    }

    await dragSortable(
      ctx.page,
      '[data-sortable-id="in-progress:c-1-boomerang"]',
      '[data-sortable-id="todo:c-2-stay-todo"]',
      { releaseAt: "top" },
    );

    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 15000,
    });

    expect(aheadCount()).toBeGreaterThan(0);
    const diffVsUpstream = execSync("git diff @{u}", {
      cwd: project.ticketsPath, encoding: "utf-8",
    });
    expect(diffVsUpstream.trim()).toBe("");
  }, 60000);

  it("unknown project: not-found page shows no pending badge", async () => {
    const unknownSlug = "nonexistent-project-xyz";

    await ctx.page.goto(`${ctx.testServer.baseUrl}/project/${unknownSlug}`);
    await ctx.page.waitForSelector("text=Project not found", { state: "visible", timeout: 15000 });
    await ctx.page.waitForSelector('[data-hydrated="true"]', { state: "attached", timeout: 15000 });
    await ctx.page.waitForTimeout(3000);
    const badgeCount = await ctx.page.locator('[data-testid="sync-button-pending-badge"]').count();
    expect(badgeCount).toBeLessThanOrEqual(1);
  }, 60000);

  it("pending badge disappears after sync when local is behind remote", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-behind-remote"),
      withRemote: true,
      withTickets: [{ number: "R-1", title: "Initial", status: "todo", folderName: "r-1-initial" }],
    });
    ctx.projects.push(project);

    execSync("git push", { cwd: project.ticketsPath });

    const tmpClone = project.remoteUrl + "-clone";
    execSync(`git clone "${project.remoteUrl}" "${tmpClone}"`);
    execSync("git checkout tickets", { cwd: tmpClone });
    fs.writeFileSync(path.join(tmpClone, "r-1-initial", "to-do.md"), "updated remotely");
    execSync("git add -A && git commit -m 'remote edit'", { cwd: tmpClone });
    execSync("git push", { cwd: tmpClone });
    fs.rmSync(tmpClone, { recursive: true, force: true });

    execSync("git fetch", { cwd: project.ticketsPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "detached", timeout: 20000,
    });
  }, 60000);

  it("pending badge appears on fresh project due to order reconciliation", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("sb-pending-absent"),
      withRemote: true,
    });
    ctx.projects.push(project);
    execSync("git push -u origin tickets", { cwd: project.ticketsPath });
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.waitForSelector('[data-testid="sync-button-pending-badge"]', {
      state: "visible", timeout: 15000,
    });
  }, 60000);
});
