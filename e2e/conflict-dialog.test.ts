import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createProject, uniqueSlug, gotoProject, setupE2E, expectOpenConfigDirRequest,
} from "./fixtures.js";

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

    await ctx.page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ status: "conflict" }),
        });
      } else {
        route.continue();
      }
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "visible", timeout: 15000,
    });

    expect(await ctx.page.locator('[data-testid="conflict-dialog-open-tickets-repo"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-close"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-abort"]').count()).toBe(1);
    expect(await ctx.page.locator('[data-testid="conflict-dialog-launch"]').count()).toBe(1);

    await ctx.page.click('[data-testid="conflict-dialog-close"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("abort dismisses the dialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("conflict-abort"),
      withRemote: true,
      appLauncherConfig: {
        profiles: [{ name: "Claude", command: "echo claude" }],
      },
    });
    ctx.projects.push(project);

    await ctx.page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ status: "conflict" }),
        });
      } else if (route.request().method() === "DELETE") {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      } else {
        route.continue();
      }
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-abort"]', { timeout: 15000 });
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

    await ctx.page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ status: "conflict" }),
        });
      } else {
        route.continue();
      }
    });
    let resolveCalled = false;
    await ctx.page.route((url) => url.pathname.endsWith("/board/resolve-conflicts"), (route) => {
      resolveCalled = true;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-launch"]', { timeout: 15000 });
    await ctx.page.click('[data-testid="conflict-dialog-launch"]');
    await ctx.page.waitForTimeout(1500);
    expect(resolveCalled).toBe(true);
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

    fs.writeFileSync(path.join(ticketsPath, "conflict.txt"), "local\n");
    execSync("git add -A", { cwd: ticketsPath });
    execSync("git commit -m local-change", { cwd: ticketsPath });

    if (!project.remoteUrl) throw new Error("expected remoteUrl");
    const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), "cl-conflict-remote-"));
    try {
      execSync(`git clone -b tickets "${project.remoteUrl}" "${tmpClone}"`);
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
    let rebaseFailed = false;
    try {
      execSync("git rebase origin/tickets", { cwd: ticketsPath, stdio: "pipe" });
    } catch {
      rebaseFailed = true;
    }
    if (!rebaseFailed) throw new Error("expected rebase to leave a conflict");

    const syncRes = await fetch(
      `${ctx.testServer.baseUrl}/api/projects/${project.projectSlug}/board/sync`,
      { method: "POST" },
    );
    const syncBody = await syncRes.json();
    expect(syncBody).toEqual({ status: "conflict" });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
      state: "visible", timeout: 15000,
    });
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

    await ctx.page.route((url) => url.pathname.endsWith("/board/sync"), (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ status: "conflict" }),
        });
      } else {
        route.continue();
      }
    });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await ctx.page.click('[data-testid="sync-button-trigger"]');
    await ctx.page.waitForSelector('[data-testid="conflict-dialog-open-tickets-repo"]', { timeout: 15000 });
    await expectOpenConfigDirRequest(ctx.page, () =>
      ctx.page.click('[data-testid="conflict-dialog-open-tickets-repo"]'));
  }, 60000);
});
