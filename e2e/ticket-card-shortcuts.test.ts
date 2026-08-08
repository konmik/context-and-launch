import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  openProject, seedProject, gotoProject,
  setupE2E,
} from "./fixtures.js";
import { git, mutateRemote } from "./git-fixtures.js";
import { testId, waitVisible, waitGone } from "./locators.js";

async function runCardShortcut(page: Page, shortcutName: string): Promise<void> {
  const trigger = testId(page, "kanban-board-ticket-menu-trigger").first();
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
    await openProject(ctx, {
      slugBase: "tcs-run",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Open in Editor", command: "echo {{ticketDir}}" }],
      },
    });
    const serverRequests: string[] = [];
    ctx.page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/_server")) serverRequests.push(url);
    });
    await runCardShortcut(ctx.page, "Open in Editor");
    await expect.poll(() => serverRequests.length, { timeout: 10000 }).toBeGreaterThan(0);
  });

  it("shortcut error opens the ErrorDialog", async () => {
    await openProject(ctx, {
      slugBase: "tcs-err",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Fail", command: "nonexistent-command-xyz" }],
      },
    });
    await runCardShortcut(ctx.page, "Fail");
    await waitVisible(ctx.page, "error-dialog-ok");
    await testId(ctx.page, "error-dialog-ok").click();
    await waitGone(ctx.page, "error-dialog-ok");
  });

  it("a card shortcut can proceed when main is behind remote", async () => {
    const folderName = "t-1-alpha";
    const markerName = "shortcut-launched.txt";
    const markerScript = `require('node:fs').writeFileSync('${markerName}', 'launched')`;
    const project = await seedProject(ctx, {
      slugBase: "tcs-behind-remote",
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

    mutateRemote(project, {
      branch: "main",
      message: "remote-change",
      edit: (clone) => fs.writeFileSync(path.join(clone, "remote-change.txt"), "remote change"),
    });
    git("fetch origin", project.projectPath);

    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await runCardShortcut(ctx.page, "Launch");
    await waitVisible(ctx.page, "ticket-detail-shortcut-confirmation-proceed");
    expect(await ctx.page.getByText("Main branch is behind remote.").isVisible()).toBe(true);
    expect(await testId(ctx.page, "error-dialog-ok").count()).toBe(0);

    await testId(ctx.page, "ticket-detail-shortcut-confirmation-proceed").click();
    const markerPath = path.join(
      ctx.testServer.dataDir, "projects", project.projectSlug, "worktrees", folderName, markerName,
    );
    await expect.poll(() => fs.existsSync(markerPath), { timeout: 20000 }).toBe(true);
  });

  it("shortcut confirmation testids are not present on the happy path", async () => {
    await openProject(ctx, {
      slugBase: "tcs-ref",
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        shortcuts: [{ name: "Open", command: "echo {{ticketDir}}" }],
      },
    });
    await runCardShortcut(ctx.page, "Open");
    expect(await testId(ctx.page, "ticket-detail-shortcut-confirmation-cancel").count()).toBe(0);
    expect(await testId(ctx.page, "ticket-detail-shortcut-confirmation-proceed").count()).toBe(0);
  });
});
