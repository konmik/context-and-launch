import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { Page } from "playwright";
import {
  createProject, uniqueSlug, gotoProject, clickTicketMenuItem,
  listTicketFolders, worktreeExists, setupE2E,
} from "./fixtures.js";

describe("TicketCleanupDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openCleanup(item: "archive" | "delete"): Promise<void> {
    await clickTicketMenuItem(ctx.page, item);
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "visible", timeout: 15000,
    });
  }

  async function waitForChecksSettled(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid^="ticket-cleanup-"][data-testid$="-status"]'),
      );
      return nodes.length === 4 && nodes.every((n) => n.getAttribute("data-state") !== "checking");
    }, undefined, { timeout: 15000 });
  }

  it("archives a ticket without a worktree, all items blocked", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tc-archive"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("archive");
    await waitForChecksSettled(ctx.page);

    for (const id of [
      "ticket-cleanup-stop-herdr-checkbox", "ticket-cleanup-delete-worktree-checkbox",
      "ticket-cleanup-delete-local-checkbox", "ticket-cleanup-delete-remote-checkbox",
    ]) {
      const box = ctx.page.locator(`[data-testid="${id}"]`);
      expect(await box.isDisabled()).toBe(true);
      expect(await box.isChecked()).toBe(false);
    }

    const herdrStatus = ctx.page.locator('[data-testid="ticket-cleanup-stop-herdr-status"]');
    expect(await herdrStatus.getAttribute("data-state")).toBe("blocked");
    expect(await herdrStatus.textContent()).toContain("Herdr is not installed");
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-worktree-status"]').textContent())
      .toContain("No worktree");

    await ctx.page.click('[data-testid="ticket-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForTimeout(1000);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
    const archived = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets", "archive", "t-1-alpha",
    );
    expect(fs.existsSync(archived)).toBe(true);
    expect(await ctx.page.locator('[data-testid="kanban-board-ticket-card"]').count()).toBe(0);
  }, 60000);

  it("deletes a ticket without a worktree after cancel then submit", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tc-delete"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await openCleanup("delete");
    await ctx.page.click('[data-testid="ticket-cleanup-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain("t-1-alpha");

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await ctx.page.click('[data-testid="ticket-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForTimeout(1000);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
  }, 60000);

  it("shows per-item check progress and enables possible items with a worktree", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tc-progress"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("delete");

    const statuses = ctx.page.locator('[data-testid^="ticket-cleanup-"][data-testid$="-status"]');
    expect(await statuses.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(await statuses.nth(i).getAttribute("data-state")).not.toBeNull();
    }

    await waitForChecksSettled(ctx.page);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-worktree-checkbox"]').isDisabled())
      .toBe(false);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-local-checkbox"]').isDisabled())
      .toBe(false);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-remote-checkbox"]').isDisabled())
      .toBe(true);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-remote-status"]').textContent())
      .toContain("No remote branch");

    await ctx.page.check('[data-testid="ticket-cleanup-delete-worktree-checkbox"]');
    await ctx.page.click('[data-testid="ticket-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForTimeout(1000);
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
  }, 60000);

  it("opens the cleanup dialog on archive when a worktree exists but useWorktree is false", async () => {
    const projectSlug = uniqueSlug("tc-flag-false");
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
    await openCleanup("archive");
    await waitForChecksSettled(ctx.page);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-worktree-checkbox"]').isDisabled())
      .toBe(false);
    await ctx.page.click('[data-testid="ticket-cleanup-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(true);
  }, 60000);

  it("cleans up a worktree folder that is not a valid git repo", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tc-notgit"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);

    const wtPath = path.join(project.worktreeRootPath!, "t-1-alpha");
    fs.unlinkSync(path.join(wtPath, ".git"));

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await ctx.page.check('[data-testid="ticket-cleanup-delete-worktree-checkbox"]');
    await ctx.page.click('[data-testid="ticket-cleanup-submit"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForTimeout(1000);
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
  }, 60000);

  it("auto-ticks possible items after checks and re-ticks on reopen", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tc-autotick"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-worktree-checkbox"]').isChecked())
      .toBe(true);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-local-checkbox"]').isChecked())
      .toBe(true);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-remote-checkbox"]').isChecked())
      .toBe(false);

    await ctx.page.uncheck('[data-testid="ticket-cleanup-delete-local-checkbox"]');
    await ctx.page.click('[data-testid="ticket-cleanup-cancel"]');
    await ctx.page.waitForSelector('[data-testid="ticket-cleanup-submit"]', {
      state: "detached", timeout: 15000,
    });

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    expect(await ctx.page.locator('[data-testid="ticket-cleanup-delete-local-checkbox"]').isChecked())
      .toBe(true);
  }, 60000);
});
