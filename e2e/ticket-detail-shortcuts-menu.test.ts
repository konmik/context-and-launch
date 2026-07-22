import { describe, it, expect } from "vitest";
import type { Page } from "playwright";
import {
  createProject, uniqueSlug, gotoProject, openTicketDetail,
  setupE2E,
} from "./fixtures.js";

async function runHeaderShortcut(page: Page, shortcutName: string): Promise<void> {
  const trigger = page.locator('[data-testid="ticket-detail-shortcuts-menu-trigger"]');
  await trigger.waitFor({ state: "visible", timeout: 15000 });
  await trigger.click();
  const selector = `[data-testid="ticket-detail-shortcuts-menu-item"]`
    + `[data-shortcut-name="${shortcutName}"]`;
  await page.locator(selector).first().waitFor({ state: "attached", timeout: 15000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`shortcut item not in DOM: ${sel}`);
    el.click();
  }, selector);
}

describe("Ticket detail shortcuts menu (e2e, real server)", () => {
  const ctx = setupE2E();

  it("running a header shortcut triggers a shortcut request", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tdsm-run"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [],
        shortcuts: [{ name: "Open in Editor", command: "echo {{ticketDir}}" }],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    const serverRequests: string[] = [];
    ctx.page.on("request", (req) => {
      const url = req.url();
      if (url.includes("/_server")) serverRequests.push(url);
    });
    await runHeaderShortcut(ctx.page, "Open in Editor");
    await expect.poll(() => serverRequests.length, { timeout: 10000 }).toBeGreaterThan(0);
  }, 60000);

  it("the shortcuts menu is absent when no shortcuts are configured", async () => {
    const project = await createProject(ctx.testServer, {
      projectSlug: uniqueSlug("tdsm-empty"),
      withTickets: [{ number: "T-1", title: "Alpha", status: "todo", folderName: "t-1-alpha" }],
      appLauncherConfig: {
        templates: [], skills: [], profiles: [], shortcuts: [],
      },
    });
    ctx.projects.push(project);
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
    await openTicketDetail(ctx.page, "t-1-alpha");
    expect(
      await ctx.page.locator('[data-testid="ticket-detail-shortcuts-menu-trigger"]').count(),
    ).toBe(0);
  }, 60000);
});
