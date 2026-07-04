import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem,
  worktreeExists,
  setupE2E,
} from "./fixtures.js";

describe("WorktreeCleanupDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openDeleteWithWorktree() {
    await clickTicketMenuItem(ctx.page, "delete");
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', { state: "visible", timeout: 15000 });
  }

  it("checkboxes toggle and cancel/submit testids respond", async () => {
    const projectSlug = uniqueSlug("wt-cleanup");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openDeleteWithWorktree();

    const wt = ctx.page.locator('[data-testid="worktree-cleanup-delete-worktree-checkbox"]');
    const localBr = ctx.page.locator('[data-testid="worktree-cleanup-delete-local-checkbox"]');
    const remoteBr = ctx.page.locator('[data-testid="worktree-cleanup-delete-remote-checkbox"]');
    await wt.check();
    await localBr.check();
    expect(await wt.isChecked()).toBe(true);
    expect(await localBr.isChecked()).toBe(true);
    expect(await remoteBr.isChecked()).toBe(false);

    await ctx.page.click('[data-testid="worktree-cleanup-cancel"]');
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(true);
  }, 60000);

  it("worktree-cleanup-submit removes worktree from disk when checked", async () => {
    const projectSlug = uniqueSlug("wt-submit");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openDeleteWithWorktree();
    await ctx.page.check('[data-testid="worktree-cleanup-delete-worktree-checkbox"]');
    await ctx.page.click('[data-testid="worktree-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
  }, 60000);

  it("shows cleanup dialog on archive when worktree exists but useWorktree flag is false", async () => {
    const projectSlug = uniqueSlug("wt-flag-false");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);

    const worktreeRoot = path.join(ctx.testServer.dataDir, "projects", projectSlug, "worktrees");
    const wtPath = path.join(worktreeRoot, "t-1-alpha");
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    execSync(`git worktree add "${wtPath}" -b "t-1-alpha"`, { cwd: project.projectPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await clickTicketMenuItem(ctx.page, "archive");
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', { state: "visible", timeout: 15000 });
    await ctx.page.click('[data-testid="worktree-cleanup-cancel"]');
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', { state: "detached", timeout: 15000 });
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(true);
  }, 60000);

  it("worktree-cleanup succeeds when worktree folder is not a valid git repo", async () => {
    const projectSlug = uniqueSlug("wt-notgit");
    const project = await createProject(ctx.testServer, {
      projectSlug,
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);

    const wtPath = path.join(project.worktreeRootPath!, "t-1-alpha");
    fs.unlinkSync(path.join(wtPath, ".git"));

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openDeleteWithWorktree();
    await ctx.page.check('[data-testid="worktree-cleanup-delete-worktree-checkbox"]');
    await ctx.page.click('[data-testid="worktree-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="worktree-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
  }, 60000);
});
