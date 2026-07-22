import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  createProject, uniqueSlug, gotoProject,
  setupE2E,
} from "./fixtures.js";

async function runCardShortcut(page: Page, shortcutName: string): Promise<void> {
  const trigger = page.locator('[data-testid="kanban-board-ticket-menu-trigger"]').first();
  await trigger.waitFor({ state: "visible", timeout: 15000 });
  await trigger.click();
  const selector = `[data-testid="kanban-board-ticket-menu-shortcut"]`
    + `[data-shortcut-name="${shortcutName}"]`;
  await page.locator(selector).waitFor({ state: "attached", timeout: 15000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`shortcut item not in DOM: ${sel}`);
    el.click();
  }, selector);
}

describe("Ticket card shortcuts (e2e, real server)", () => {
  const ctx = setupE2E();

  it("running a card shortcut triggers a shortcut request", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tcs-run"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Open in Editor", command: "echo {{ticketDir}}" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    const serverRequests: string[] = [];
    ctx.page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/_server")) serverRequests.push(url);
    });
    await runCardShortcut(ctx.page, "Open in Editor");
    await expect.poll(() => serverRequests.length, { timeout: 10000 }).toBeGreaterThan(0);
  }, 60000);

  it("shortcut error opens the ErrorDialog", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tcs-err"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Fail", command: "nonexistent-command-xyz" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await runCardShortcut(ctx.page, "Fail");
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "visible", timeout: 20000,
    });
    await ctx.page.click('[data-testid="error-dialog-ok"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "detached", timeout: 15000,
    });
  }, 60000);

  it("a card shortcut can proceed when main is behind remote", async () => {
    const folderName = "t-1-alpha";
    const markerName = "shortcut-launched.txt";
    const markerScript = `require('node:fs').writeFileSync('${markerName}', 'launched')`;
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tcs-behind-remote"),
      withRemote: true,
      withTickets: [{
        number: "T-1", title: "Alpha", status: "todo", folderName, useWorktree: true,
      }],
      appLauncherConfig: {
        shortcuts: [{
          name: "Launch",
          command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(markerScript)}`,
        }],
      },
    });
    ctx.projects.push(project);

    const pusherDir = path.join(ctx.testServer.reposParentDir, uniqueSlug("tcs-pusher"));
    execSync(`git clone --branch main "${project.remoteUrl}" "${pusherDir}"`);
    execSync("git config user.email test@test.com", { cwd: pusherDir });
    execSync("git config user.name Test", { cwd: pusherDir });
    fs.writeFileSync(path.join(pusherDir, "remote-change.txt"), "remote change");
    execSync("git add remote-change.txt", { cwd: pusherDir });
    execSync("git commit -m remote-change", { cwd: pusherDir });
    execSync("git push", { cwd: pusherDir });
    execSync("git fetch origin", { cwd: project.projectPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await runCardShortcut(ctx.page, "Launch");
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcut-confirmation-proceed"]', {
      state: "visible", timeout: 20000,
    });
    expect(await ctx.page.getByText("Main branch is behind remote.").isVisible()).toBe(true);
    expect(await ctx.page.locator('[data-testid="error-dialog-ok"]').count()).toBe(0);

    await ctx.page.click('[data-testid="ticket-detail-shortcut-confirmation-proceed"]');
    const markerPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "worktrees", folderName, markerName,
    );
    await expect.poll(() => fs.existsSync(markerPath), { timeout: 20000 }).toBe(true);
  }, 60000);

  it("shortcut confirmation testids are not present on the happy path", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tcs-ref"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        shortcuts: [{ name: "Open", command: "echo {{ticketDir}}" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await runCardShortcut(ctx.page, "Open");
    expect(await ctx.page.locator('[data-testid="ticket-detail-shortcut-confirmation-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-shortcut-confirmation-proceed"]').count()).toBe(0);
  }, 60000);
});
