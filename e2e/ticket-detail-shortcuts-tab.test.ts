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

  it("dirty-worktree shortcut dialog testids are not present on the happy path", async () => {
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
    expect(await ctx.page.locator('[data-testid="ticket-detail-dirty-worktree-cancel"]').count()).toBe(0);
    expect(await ctx.page.locator('[data-testid="ticket-detail-dirty-worktree-run-anyway"]').count()).toBe(0);
  }, 60000);
});
