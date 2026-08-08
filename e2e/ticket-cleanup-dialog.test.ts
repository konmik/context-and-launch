import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Page } from "playwright";
import {
  openProject, clickTicketMenuItem,
  listTicketFolders, worktreeExists, poll, setupE2E,
  setCommandTemplateOverride,
  seedProject, gotoProject,
} from "./fixtures.js";
import { branchExists, commitAll, git } from "./git-fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("TicketCleanupDialog (e2e, real server)", () => {
  const ctx = setupE2E();

  async function openCleanup(item: "archive" | "delete"): Promise<void> {
    await clickTicketMenuItem(ctx.page, item);
    await waitVisible(ctx.page, "ticket-cleanup-submit");
  }

  async function waitForChecksSettled(page: Page): Promise<void> {
    await page.waitForFunction(() => {
      const nodes = Array.from(
        document.querySelectorAll('[data-testid^="ticket-cleanup-"][data-testid$="-status"]'),
      );
      return nodes.length === 4 && nodes.every((n) => {
        const state = n.getAttribute("data-state");
        return state !== "checking" && state !== "running";
      });
    }, undefined, { timeout: 15000 });
  }

  it("archives a ticket without a worktree, all items blocked", async () => {
    const project = await openProject(ctx, {
      slugBase: "tc-archive",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });
    await openCleanup("archive");
    await waitForChecksSettled(ctx.page);

    for (const id of [
      "ticket-cleanup-stop-herdr-button", "ticket-cleanup-delete-worktree-button",
      "ticket-cleanup-delete-local-button", "ticket-cleanup-delete-remote-button",
    ]) {
      const button = ctx.page.locator(`[data-testid="${id}"]`);
      expect(await button.isDisabled()).toBe(true);
    }

    const herdrStatus = testId(ctx.page, "ticket-cleanup-stop-herdr-status");
    expect(await herdrStatus.getAttribute("data-state")).toBe("blocked");
    expect(await herdrStatus.textContent()).toContain("Herdr is not installed");
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-status").textContent())
      .toContain("No worktree");

    await testId(ctx.page, "ticket-cleanup-submit").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes("t-1-alpha"),
      5000,
    );
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
    const archived = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets", "archive", "t-1-alpha",
    );
    expect(fs.existsSync(archived)).toBe(true);
    await expect.poll(
      () => testId(ctx.page, "kanban-board-ticket-card").count(),
      { timeout: 15000 },
    ).toBe(0);
  });

  it("deletes a ticket without a worktree after cancel then submit", async () => {
    const project = await openProject(ctx, {
      slugBase: "tc-delete",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });

    await openCleanup("delete");
    await testId(ctx.page, "ticket-cleanup-cancel").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).toContain("t-1-alpha");

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await testId(ctx.page, "ticket-cleanup-submit").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes("t-1-alpha"),
      5000,
    );
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
  });

  it("shows per-item check progress and enables possible items with a worktree", async () => {
    const project = await openProject(ctx, {
      slugBase: "tc-progress",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    await openCleanup("delete");

    const statuses = ctx.page.locator('[data-testid^="ticket-cleanup-"][data-testid$="-status"]');
    expect(await statuses.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(await statuses.nth(i).getAttribute("data-state")).not.toBeNull();
    }

    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-button").isDisabled())
      .toBe(false);
    expect(await testId(ctx.page, "ticket-cleanup-delete-local-button").isDisabled())
      .toBe(false);
    expect(await testId(ctx.page, "ticket-cleanup-delete-remote-button").isDisabled())
      .toBe(true);
    const remoteButton = testId(ctx.page, "ticket-cleanup-delete-remote-button");
    const remoteStatus = testId(ctx.page, "ticket-cleanup-delete-remote-status");
    expect(await remoteStatus.textContent())
      .toContain("No remote branch");
    const [buttonBox, statusBox] = await Promise.all([
      remoteButton.boundingBox(), remoteStatus.boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(statusBox!.x).toBeGreaterThan(buttonBox!.x + buttonBox!.width);

    await testId(ctx.page, "ticket-cleanup-delete-worktree-button").click();
    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-status").textContent())
      .toContain("No worktree");
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);

    await testId(ctx.page, "ticket-cleanup-submit").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    await poll(
      () => listTicketFolders(ctx.testServer, project.projectSlug),
      (f) => !f.includes("t-1-alpha"),
      5000,
    );
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
    expect(listTicketFolders(ctx.testServer, project.projectSlug)).not.toContain("t-1-alpha");
  });

  it("opens the cleanup dialog on archive when a worktree exists but useWorktree is false", async () => {
    const project = await seedProject(ctx, {
      slugBase: "tc-flag-false",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
    });

    const worktreeRoot = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "worktrees",
    );
    const wtPath = path.join(worktreeRoot, "t-1-alpha");
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    git(`worktree add "${wtPath}" -b "t-1-alpha"`, project.projectPath);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("archive");
    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-button").isDisabled())
      .toBe(false);
    await testId(ctx.page, "ticket-cleanup-cancel").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(true);
  });

  it("cleans up a worktree folder that is not a valid git repo", async () => {
    const project = await openProject(ctx, {
      slugBase: "tc-notgit",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });
    ctx.projects.push(project);

    const wtPath = path.join(project.worktreeRootPath!, "t-1-alpha");
    fs.unlinkSync(path.join(wtPath, ".git"));

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await testId(ctx.page, "ticket-cleanup-delete-worktree-button").click();
    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-status").textContent())
      .toContain("No worktree");
    await testId(ctx.page, "ticket-cleanup-submit").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");
    await poll(
      () => worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha"),
      (exists) => exists === false,
      5000,
    );
    expect(worktreeExists(ctx.testServer, project.projectSlug, "t-1-alpha")).toBe(false);
  });

  it("force deletes a branch with unmerged commits after cancel then confirm", async () => {
    const project = await seedProject(ctx, {
      slugBase: "tc-force-delete",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });

    const wtPath = path.join(project.worktreeRootPath!, "t-1-alpha");
    fs.writeFileSync(path.join(wtPath, "unmerged.txt"), "unmerged work");
    commitAll(wtPath, "unmerged");

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await testId(ctx.page, "ticket-cleanup-delete-worktree-button").click();
    await waitForChecksSettled(ctx.page);

    const localStatus = testId(ctx.page, "ticket-cleanup-delete-local-status");
    expect(await localStatus.textContent()).toContain("Branch has unmerged commits");
    expect(branchExists(project.projectPath, "t-1-alpha")).toBe(true);

    await testId(ctx.page, "ticket-cleanup-force-delete-branch").click();
    await testId(ctx.page, "force-delete-branch-cancel").click();
    await waitGone(ctx.page, "force-delete-branch-confirm");
    expect(branchExists(project.projectPath, "t-1-alpha")).toBe(true);

    await testId(ctx.page, "ticket-cleanup-force-delete-branch").click();
    await testId(ctx.page, "force-delete-branch-confirm").click();
    await expect.poll(
      () => localStatus.textContent(),
      { timeout: 15000 },
    ).toContain("No local branch");
    expect(branchExists(project.projectPath, "t-1-alpha")).toBe(false);
  });

  it.skipIf(process.platform !== "win32")(
    "kills the process locking a worktree after cancel then confirm",
    async () => {
      const project = await seedProject(ctx, {
        slugBase: "tc-kill",
        withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
        withWorktrees: [{ folderName: "t-1-alpha" }],
      });

      const wtPath = path.join(project.worktreeRootPath!, "t-1-alpha");
      const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        cwd: wtPath, stdio: "ignore",
      });
      const holderPid = holder.pid!;
      setCommandTemplateOverride(
        ctx.testServer,
        "agent-worktree.locking-processes.windows",
        `Write-Output "${holderPid}$([char]9)node"`,
      );

      try {
        await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
        await openCleanup("delete");
        await waitForChecksSettled(ctx.page);

        const worktreeStatus = testId(ctx.page, "ticket-cleanup-delete-worktree-status");
        expect(await worktreeStatus.textContent()).toContain("in use by another process");

        await testId(ctx.page, "ticket-cleanup-kill-processes").click();
        await waitVisible(ctx.page, "kill-processes-confirm");
        expect(await ctx.page.getByText(`PID ${holderPid}`).count()).toBe(1);

        await testId(ctx.page, "kill-processes-cancel").click();
        await waitGone(ctx.page, "kill-processes-confirm");
        expect(processAlive(holderPid)).toBe(true);

        await testId(ctx.page, "ticket-cleanup-kill-processes").click();
        await testId(ctx.page, "kill-processes-confirm").click();
        await poll(() => processAlive(holderPid), (alive) => alive === false, 15000);
        expect(processAlive(holderPid)).toBe(false);
      } finally {
        if (processAlive(holderPid)) holder.kill();
      }
    });

  it("keeps completed cleanup status when the dialog is reopened", async () => {
    await openProject(ctx, {
      slugBase: "tc-autotick",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      withWorktrees: [{ folderName: "t-1-alpha" }],
    });

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    await testId(ctx.page, "ticket-cleanup-delete-worktree-button").click();
    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-status").textContent())
      .toContain("No worktree");
    await testId(ctx.page, "ticket-cleanup-cancel").click();
    await waitGone(ctx.page, "ticket-cleanup-submit");

    await openCleanup("delete");
    await waitForChecksSettled(ctx.page);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-button").isDisabled())
      .toBe(true);
    expect(await testId(ctx.page, "ticket-cleanup-delete-worktree-status").textContent())
      .toContain("No worktree");
  });
});
