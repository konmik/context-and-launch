import { describe, it, expect } from "vitest";
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
});
