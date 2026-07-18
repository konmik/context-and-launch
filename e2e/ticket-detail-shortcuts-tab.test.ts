import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  setupE2E,
} from "./fixtures.js";

describe("Ticket detail Shortcuts tab (e2e, real server)", () => {
  const ctx = setupE2E();

  it("ticket-detail-shortcuts-run-button triggers a shortcut request", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tds-run"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Open in Editor", command: "echo {{ticketDir}}" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
      state: "visible", timeout: 15000,
    });
    const serverRequests: string[] = [];
    ctx.page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/_server")) serverRequests.push(url);
    });
    await ctx.page.click('[data-testid="ticket-detail-shortcuts-run-button"]');
    await expect.poll(() => serverRequests.length, { timeout: 10000 }).toBeGreaterThan(0);
  }, 60000);

  it("shortcut error opens ErrorDialog instead of inline banner", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tds-err"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Fail", command: "nonexistent-command-xyz" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-shortcuts-run-button"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "visible", timeout: 20000,
    });
    await ctx.page.click('[data-testid="error-dialog-ok"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
      state: "visible", timeout: 5000,
    });
  }, 60000);

  it("a shortcut can proceed when main is behind remote", async () => {
    const folderName = "t-1-alpha";
    const markerName = "shortcut-launched.txt";
    const markerScript = `require('node:fs').writeFileSync('${markerName}', 'launched')`;
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tds-behind-remote"),
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

    const pusherDir = path.join(ctx.testServer.reposParentDir, uniqueSlug("tds-pusher"));
    execSync(`git clone --branch main "${project.remoteUrl}" "${pusherDir}"`);
    execSync("git config user.email test@test.com", { cwd: pusherDir });
    execSync("git config user.name Test", { cwd: pusherDir });
    fs.writeFileSync(path.join(pusherDir, "remote-change.txt"), "remote change");
    execSync("git add remote-change.txt", { cwd: pusherDir });
    execSync("git commit -m remote-change", { cwd: pusherDir });
    execSync("git push", { cwd: pusherDir });
    execSync("git fetch origin", { cwd: project.projectPath });

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, folderName);
    await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
    await ctx.page.click('[data-testid="ticket-detail-shortcuts-run-button"]');
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

  it("shortcut error dialog screenshot", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tds-screenshot"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Fail", command: "nonexistent-command-xyz" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
      state: "visible", timeout: 15000,
    });
    await ctx.page.click('[data-testid="ticket-detail-shortcuts-run-button"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "visible", timeout: 20000,
    });
    const ticketFolder = "C:\\Users\\elkmo\\.context-launch\\projects\\ai-stages"
      + "\\tickets\\st-0036-fix-shows-shortcut-errors-inside-ticket-window-content";
    const screenshotPath = path.join(ticketFolder, "error-dialog-screenshot.png");
    await ctx.page.screenshot({ path: screenshotPath, fullPage: true });
    await ctx.page.click('[data-testid="error-dialog-ok"]');
    await ctx.page.waitForSelector('[data-testid="error-dialog-ok"]', {
      state: "detached", timeout: 15000,
    });
    await ctx.page.waitForSelector('[data-testid="ticket-detail-shortcuts-run-button"]', {
      state: "visible", timeout: 5000,
    });
  }, 60000);

  it("shortcut confirmation testids are not present on the happy path", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tds-ref"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        shortcuts: [{ name: "Open", command: "echo {{ticketDir}}" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    await ctx.page.click('[data-testid="ticket-detail-tab-shortcuts"]');
    expect(await ctx.page.locator('[data-testid="ticket-detail-shortcut-confirmation-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-shortcut-confirmation-proceed"]').count()).toBe(0);
  }, 60000);
});
