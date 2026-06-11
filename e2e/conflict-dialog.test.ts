import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createProject, uniqueSlug, gotoProject, setupE2E, expectOpenConfigDirRequest,
  openConflictDialog, readProjectRegistry,
} from "./fixtures.js";
import { type Page } from "playwright";

async function forceSyncConflict(page: Page): Promise<void> {
  await page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ status: "conflict" }),
      });
    } else {
      route.continue();
    }
  });
}

// Reproduce the state after a user launches conflict resolution: a scratch
// worktree (sibling of the live tickets folder) with a rebase in progress.
// The live tickets folder is left clean on its last good commit.
function createActiveRebaseConflict(ticketsPath: string, remoteUrl: string | null | undefined): void {
  fs.writeFileSync(path.join(ticketsPath, "conflict.txt"), "local\n");
  execSync("git add -A", { cwd: ticketsPath });
  execSync("git commit -m local-change", { cwd: ticketsPath });

  if (!remoteUrl) throw new Error("expected remoteUrl");
  const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), "cl-conflict-remote-"));
  try {
    execSync(`git clone -b tickets "${remoteUrl}" "${tmpClone}"`);
    execSync("git config user.email test@test.com", { cwd: tmpClone });
    execSync("git config user.name Test", { cwd: tmpClone });
    fs.writeFileSync(path.join(tmpClone, "conflict.txt"), "remote\n");
    execSync("git add -A", { cwd: tmpClone });
    execSync("git commit -m remote-change", { cwd: tmpClone });
    execSync("git push origin tickets", { cwd: tmpClone });
  } finally {
    fs.rmSync(tmpClone, { recursive: true, force: true });
  }

  execSync("git fetch", { cwd: ticketsPath });
  const scratch = `${ticketsPath}-conflict-resolve`;
  execSync(`git worktree add --detach "${scratch}" HEAD`, { cwd: ticketsPath });
  let rebaseFailed = false;
  try {
    execSync("git rebase origin/tickets", { cwd: scratch, stdio: "pipe" });
  } catch {
    rebaseFailed = true;
  }
  if (!rebaseFailed) throw new Error("expected rebase to leave a conflict");
}

describe("Conflict dialog (e2e, real server)", () => {
  const ctx = setupE2E();

  it("conflict dialog elements render when sync returns conflict (intercepted)", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-rendering"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);

    expect(await ctx.page.locator('[data-testid="conflict-dialog-open-tickets-repo"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-close"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-launch"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-abort"]').count()).toBeLessThanOrEqual(1);

    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("abort dismisses the dialog during an active rebase", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-abort"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-abort"]').count()).toBe(1);
    await ctx.page.click('[data-testid="conflict-dialog-abort"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-abort"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("launch button fires resolve-conflicts request", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-launch"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    let serverCalled = false;
    ctx.page.on("request", (r) => {
      if (r.url().includes("/_server")) serverCalled = true;
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await ctx.page.click('[data-testid="conflict-dialog-launch"]');
    await ctx.page.waitForTimeout(1500);
    expect(serverCalled).toBe(true);
  }, 60000);

  it("conflict badge appears after dismissing a mid-session sync conflict", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-badge-mid-session"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    expect(await ctx.page.locator('[data-testid="sync-button-conflict-badge"]').count()).toBe(0);

    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await openConflictDialog(ctx.page);
    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });

    await ctx.page.waitForSelector('[data-testid="sync-button-conflict-badge"]', {
      state: "visible", timeout: 15000,
    });
    expect(await ctx.page.locator('[data-testid="sync-button-pending-badge"]').count()).toBe(0);
  }, 60000);

  it("sync during active rebase conflict shows conflict dialog (regression: HEAD-detached error)", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-active-rebase"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
  }, 60000);

  it("selecting a profile persists the global pref and pre-selects it on reopen", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-global-pref"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [
          { name: "Claude", command: "echo claude" },
          { name: "Codex", command: "echo codex" },
        ],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);

    const select = ctx.page.locator('[data-testid="conflict-dialog-profile-select"]');
    await select.selectOption("Codex");

    // Wait for the PUT to land in config.json.
    await expect.poll(
      () => readProjectRegistry(ctx.testServer).lastUsedProfileName,
      { timeout: 15000 },
    ).toBe("Codex");

    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });

    // Reload the page and reopen the dialog: the previously selected profile is pre-selected.
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await expect.poll(async () =>
      ctx.page.locator('[data-testid="conflict-dialog-profile-select"]').inputValue(),
    ).toBe("Codex");
  }, 60000);

  it("open-tickets-repo fires open-config-dir", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-open"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    const ticketsPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "tickets",
    );
    createActiveRebaseConflict(ticketsPath, project.remoteUrl);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openConflictDialog(ctx.page);
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="conflict-dialog-open-tickets-repo"]'));
  }, 60000);
});
